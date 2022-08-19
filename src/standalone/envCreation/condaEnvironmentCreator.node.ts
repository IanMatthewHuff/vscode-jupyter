// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as path from '../../platform/vscode-path/path';
import { Memento, QuickPickItem, Uri, workspace } from 'vscode';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { KernelConnectionMetadata } from '../../kernels/types';
import { IEnvironmentCreator } from './types';
import { EnvironmentType, PythonEnvironment } from '../../platform/pythonEnvironments/info';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IApplicationShell } from '../../platform/common/application/types';
import {
    IControllerLoader,
    IControllerRegistration,
    IVSCodeNotebookController
} from '../../notebooks/controllers/types';
import { createInterpreterKernelSpec, getKernelId } from '../../kernels/helpers';
import { InteractiveWindowView, JupyterNotebookView } from '../../platform/common/constants';
import { KernelFilterService } from '../../notebooks/controllers/kernelFilter/kernelFilterService';
import { traceInfo } from '../../platform/logging';
import { ProgressReporter } from '../../platform/progress/progressReporter';
import { ReportableAction } from '../../platform/progress/types';

const WorkspaceCondaControllerMappingKey = 'workspace-mapped-conda-env';

interface ICondaEnvironmentQuickPickItem extends QuickPickItem {
    interpreter: PythonEnvironment;
}

export class CondaEnvironmentCreator implements IEnvironmentCreator {
    private availablePromise: Promise<boolean> | undefined;
    constructor(
        private readonly interpreterService: IInterpreterService,
        private readonly processServiceFactory: IProcessServiceFactory,
        private readonly workspaceMemento: Memento,
        private readonly appShell: IApplicationShell,
        private readonly controllerRegistration: IControllerRegistration,
        private readonly controllerLoader: IControllerLoader,
        private readonly kernelFilterService: KernelFilterService,
        private readonly progressReporter: ProgressReporter
    ) {}

    public readonly id: string = 'CondaEnvironmentCreator';
    public readonly displayName: string = 'Conda';

    public available(): Promise<boolean> {
        // IANHU: Note for now we just calculate this once, probably not the long term solution
        // such as if another interpreter is installed
        if (!this.availablePromise) {
            this.availablePromise = this.checkAvailability();
        }

        return this.availablePromise;
    }

    public async hasWorkspaceLocalControllers(_kernelConnectionMetadata: KernelConnectionMetadata[]): Promise<boolean> {
        // Possible flow
        // 1. Is there a current conda env active?
        // 2. Have we mapped in a previous workspace?
        const previousLink = await this.previousLinkedCondaEnv();
        const activeEnv = await this.activeCondaEnvironment();

        return previousLink || activeEnv;
    }

    public async create(): Promise<void> {
        this.progressReporter.report({ action: ReportableAction.CreatingCondaEnvironment, phase: 'started' });

        // Offer two options
        // 1. Select Existing Conda Env
        // Selecting an existing should be gated on having one found
        // 2. Create New Conda Env
        try {
            const selection = await this.selectExistingOrNewEnvironment();

            switch (selection) {
                case 'New Conda Environment':
                    await this.createNewEnvironment();
                    break;
                case 'Existing Conda Environment':
                    await this.linkWorkspaceWithExistingEnvironment();
                    break;
                default:
                    break;
            }
        } finally {
            this.progressReporter.report({ action: ReportableAction.CreatingCondaEnvironment, phase: 'started' });
        }
    }

    // Was vscode launched from an active conda environment?
    private async activeCondaEnvironment(): Promise<boolean> {
        // From peeking it seems like CONDA_PREFIX which points to the current active env might be the way to do this
        const condaPrefix = process.env['CONDA_PREFIX'];

        if (condaPrefix) {
            const condaEnvPath = path.join(condaPrefix, 'bin', 'python');
            const condaUri = Uri.file(condaEnvPath);
            const interpreterDetails = await this.interpreterService.getInterpreterDetails(condaUri);

            if (interpreterDetails) {
                await this.registerController(interpreterDetails);
            }
        }

        return false;
    }

    // Have we mapped in a previous global conda => workspace mapping?
    private async previousLinkedCondaEnv() {
        const mementoValue = this.workspaceMemento.get<string | undefined>(WorkspaceCondaControllerMappingKey);
        return !!mementoValue;
    }

    // Have we previously created a local mapping from this workspace to a global conda env?

    // Target an existing connection to use
    private async linkWorkspaceWithExistingEnvironment(): Promise<void> {
        const existingEnv = await this.getExistingCondaEnvironment();

        if (existingEnv) {
            const registeredControllers = await this.registerController(existingEnv);

            if (registeredControllers.length > 0) {
                // If we registered a controller, also associate it with the workspace
                // IANHU: For now, don't actually do this as I'm still testing the other bits first
                // await this.workspaceMemento.update(WorkspaceCondaControllerMappingKey, registeredControllers[0].id);
            }
        }
    }

    // Register a controller for an existing conda env
    private async registerController(interpreter: PythonEnvironment): Promise<IVSCodeNotebookController[]> {
        const kernelSpec = createInterpreterKernelSpec(interpreter);
        const id = getKernelId(kernelSpec, interpreter);
        const connectionMetadata: KernelConnectionMetadata = {
            kind: 'startUsingPythonInterpreter',
            kernelSpec,
            interpreter,
            id
        };

        // IANHU: Also just for testing remove it from the kernel filter service
        await this.kernelFilterService.removeConnectionFromFilter(connectionMetadata);

        return this.controllerRegistration.add(connectionMetadata, [JupyterNotebookView, InteractiveWindowView]);
    }

    // Select an existing conda environment that we know about
    private async getExistingCondaEnvironment(): Promise<PythonEnvironment | undefined> {
        // IANHU: Possibly filter just on stuff that has IPyKernel
        const condaConnections = this.controllerRegistration.all.filter((connection) => {
            return (
                connection.kind === 'startUsingPythonInterpreter' &&
                connection.interpreter.envType === EnvironmentType.Conda
            );
        });

        // IANHU: remove !
        const condaEnvQuickPickItems: ICondaEnvironmentQuickPickItem[] = condaConnections.map((connection) => {
            return { label: connection.interpreter!.displayName!, interpreter: connection.interpreter! };
        });

        const envSelected = await this.appShell.showQuickPick(condaEnvQuickPickItems, {
            title: 'Select existing Conda environment'
        });

        if (envSelected) {
            return envSelected.interpreter;
        }

        return undefined;
    }

    private async createNewEnvironment(): Promise<void> {
        const condaPath = process.env['CONDA_EXE'];
        const processService = await this.processServiceFactory.create(undefined);
        // IANHU: This is a bit naieve and not correct for multi root
        const workspaceDir = workspace.workspaceFolders?.[0].uri.fsPath;

        const envName = await this.getCondaEnvironmentName();

        if (condaPath && workspaceDir && envName) {
            const output = await processService.exec(
                condaPath,
                ['create', '-n', envName, 'python', 'ipykernel', '-y'],
                { cwd: workspaceDir, throwOnStdErr: false, mergeStdOutErr: true }
            );

            traceInfo(output.stdout);

            const condaInterpreter = await this.getCreatedInterpreter(envName);

            if (!condaInterpreter) {
                return;
            }

            await this.registerController(condaInterpreter);
        }
    }

    private async getCreatedInterpreter(envName: string): Promise<PythonEnvironment | undefined> {
        const condaBase = process.env['CONDA_ROOT'];

        if (condaBase) {
            const condaEnvPath = path.join(condaBase, 'envs', envName, 'bin', 'python');
            const condaUri = Uri.file(condaEnvPath);
            return this.interpreterService.getInterpreterDetails(condaUri);
        }
    }

    private async getCondaEnvironmentName(): Promise<string | undefined> {
        const name = await this.appShell.showInputBox({ title: 'Select Conda Environment Name' });
        return name;
    }

    private async selectExistingOrNewEnvironment(): Promise<string | undefined> {
        const pickOptions: string[] = ['New Conda Environment', 'Existing Conda Environment'];
        const selection = await this.appShell.showQuickPick(pickOptions, { title: 'Select New / Existing' });
        return selection;
    }

    // An interpreter exist which is a Conda interpreter
    private async checkAvailability(): Promise<boolean> {
        const envVar = process.env['CONDA_EXE'];

        return !!envVar;
    }
}

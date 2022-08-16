// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as path from '../../platform/vscode-path/path';
import { CancellationTokenSource, QuickPickItem, Uri, window, workspace } from 'vscode';
import { createInterpreterKernelSpec, getKernelId } from '../../kernels/helpers';
import { IKernelDependencyService, KernelConnectionMetadata } from '../../kernels/types';
import { IControllerRegistration, IVSCodeNotebookController } from '../../notebooks/controllers/types';
import { IApplicationShell } from '../../platform/common/application/types';
import { InteractiveWindowView, JupyterNotebookView } from '../../platform/common/constants';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { traceInfo } from '../../platform/logging';
import { EnvironmentType } from '../../platform/pythonEnvironments/info';
import { PythonEnvironment } from '../api/extension';
import { IEnvironmentCreator } from './types';
import { DisplayOptions } from '../../kernels/displayOptions';
import { IInstaller, Product } from '../../kernels/installer/types';

interface IInterpreterQuickPickItem extends QuickPickItem {
    interpreter: PythonEnvironment;
}
export class VenvEnvironmentCreator implements IEnvironmentCreator {
    private availablePromise: Promise<boolean> | undefined;
    constructor(
        private readonly interpreterService: IInterpreterService,
        private readonly applicationShell: IApplicationShell,
        private readonly processServiceFactory: IProcessServiceFactory,
        private readonly controllerRegistration: IControllerRegistration,
        private readonly kernelDependencyService: IKernelDependencyService,
        private readonly installer: IInstaller
    ) {}

    public readonly id: string = 'VenvEnvironmentCreator';
    public readonly displayName: string = 'Venv';

    // Basic logic, a python interpreter exists which has pip and venv
    public async available(): Promise<boolean> {
        // IANHU: Note for now we just calculate this once, probably not the long term solution
        // such as if another interpreter is installed
        if (!this.availablePromise) {
            this.availablePromise = this.checkAvailability();
        }

        return this.availablePromise;
    }

    public hasWorkspaceLocalControllers(kernelConnectionMetadata: KernelConnectionMetadata[]): boolean {
        // IANHU: Abstract base class possibility later?
        return kernelConnectionMetadata.some((connectionMetadata) => isWorkspaceLocalConnection(connectionMetadata));
    }

    public async create(): Promise<void> {
        const selectedInterpreter = await this.getInterpreter(false);

        if (selectedInterpreter) {
            await this.createVenv(selectedInterpreter);
        } else {
            // IANHU: Throw?
        }
    }

    private async checkAvailability(): Promise<boolean> {
        const interpreterList = await this.interpreterService.getInterpreters();

        const foundValidInterpreter = interpreterList.some(async (interpreter) => {
            const pipFound = await this.installer.isInstalled(Product.pip, interpreter);
            const venvFound = await this.installer.isInstalled(Product.venv, interpreter);

            return pipFound && venvFound;
        });

        return foundValidInterpreter;
    }

    private async getInterpreter(userPick: boolean): Promise<PythonEnvironment | undefined> {
        const interpreterList = await this.interpreterService.getInterpreters();

        if (userPick) {
            const quickPickInterpreters: IInterpreterQuickPickItem[] = interpreterList.map((interpreter) => {
                return { label: interpreter.displayName || 'Missing Display Name', interpreter: interpreter };
            });

            const interpreterSelected = await this.applicationShell.showQuickPick(quickPickInterpreters, {
                title: 'Select interpreter to create venv with'
            });

            if (interpreterSelected) {
                return interpreterSelected.interpreter;
            }
        } else {
            interpreterList.sort((a, b) =>
                a.version && b.version ? this.compareSemVerLikeVersions(a.version, b.version) : 0
            );

            return interpreterList[interpreterList.length - 1];
        }
        // IANHU: this should actually verify with the pip / venv check
    }

    // IANHU: Lifted from python team
    private compareSemVerLikeVersions(
        v1: { major: number; minor: number; patch: number },
        v2: { major: number; minor: number; patch: number }
    ): 1 | 0 | -1 {
        if (v1.major === v2.major) {
            if (v1.minor === v2.minor) {
                if (v1.patch === v2.patch) {
                    return 0;
                }
                return v1.patch > v2.patch ? 1 : -1;
            }
            return v1.minor > v2.minor ? 1 : -1;
        }
        return v1.major > v2.major ? 1 : -1;
    }

    private async createVenv(interpreter: PythonEnvironment): Promise<void> {
        // IANHU: Pass in the resource here as activenotebook? Or not needed?
        const processService = await this.processServiceFactory.create(undefined);

        // IANHU: This is a bit naieve and not correct for multi root
        const workspaceDir = workspace.workspaceFolders?.[0].uri.fsPath;

        if (!workspaceDir) {
            return;
            // THROW?
        }

        const output = await processService.exec(interpreter.uri.fsPath, ['-m', 'venv', '.venv'], {
            cwd: workspaceDir,
            throwOnStdErr: false,
            mergeStdOutErr: true
        });

        // IANHU: Error handling. Looks like we get '' for a correct generation, also can check
        // to make sure the file is there
        traceInfo(output.stdout);

        const newInterpreter = await this.getCreatedInterpreter(workspaceDir);

        if (!newInterpreter) {
            // IANHU: Error
            return;
        }

        // Now register a controller off of the created venv
        const registeredControllers = await this.registerController(newInterpreter);

        if (!(registeredControllers.length > 0)) {
            // IANHU: Error
            return;
        }

        // Get our packages in there as well
        await this.installPackages(registeredControllers[0]);
    }

    private async getCreatedInterpreter(workspaceDir: string): Promise<PythonEnvironment | undefined> {
        const pythonPath = path.join(workspaceDir, '.venv', 'bin', 'python');
        const pythonUri = Uri.file(pythonPath);
        return this.interpreterService.getInterpreterDetails(pythonUri);
    }

    private async installPackages(controller: IVSCodeNotebookController) {
        // IANHU: remove !
        const installed = await this.installer.isInstalled(Product.ipykernel, controller.connection.interpreter!);

        const fakeCancelToken = new CancellationTokenSource();

        if (!installed) {
            // IANHU: remove !
            await this.installer.install(Product.ipykernel, controller.connection.interpreter!, fakeCancelToken);
        }
    }

    private registerController(interpreter: PythonEnvironment): IVSCodeNotebookController[] {
        const kernelSpec = createInterpreterKernelSpec(interpreter);
        const id = getKernelId(kernelSpec, interpreter);
        const connectionMetadata: KernelConnectionMetadata = {
            kind: 'startUsingPythonInterpreter',
            kernelSpec,
            interpreter,
            id
        };
        return this.controllerRegistration.add(connectionMetadata, [JupyterNotebookView, InteractiveWindowView]);
    }
}

// Check on specific connection to see if it fits the local bill
function isWorkspaceLocalConnection(kernelConnectionMetadata: KernelConnectionMetadata): boolean {
    // Logic: python interpreter start, interpreter type is venv
    return (
        kernelConnectionMetadata.kind === 'startUsingPythonInterpreter' &&
        kernelConnectionMetadata.interpreter.envType === EnvironmentType.Venv
    );
}

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as path from '../../platform/vscode-path/path';
import { QuickPickItem, Uri, workspace } from 'vscode';
import { createInterpreterKernelSpec, getKernelId } from '../../kernels/helpers';
import { KernelConnectionMetadata } from '../../kernels/types';
import { IControllerRegistration } from '../../notebooks/controllers/types';
import { IApplicationShell } from '../../platform/common/application/types';
import { InteractiveWindowView, JupyterNotebookView } from '../../platform/common/constants';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { traceInfo } from '../../platform/logging';
import { EnvironmentType } from '../../platform/pythonEnvironments/info';
import { PythonEnvironment } from '../api/extension';
import { IEnvironmentCreator } from './types';

interface IInterpreterQuickPickItem extends QuickPickItem {
    interpreter: PythonEnvironment;
}
export class VenvEnvironmentCreator implements IEnvironmentCreator {
    constructor(
        private readonly interpreterService: IInterpreterService,
        private readonly applicationShell: IApplicationShell,
        private readonly processServiceFactory: IProcessServiceFactory,
        private readonly controllerRegistration: IControllerRegistration
    ) {}

    public available(): boolean {
        // IANHU: This should check if we have a python on the system with pip and venv
        return true;
    }

    public hasWorkspaceLocalControllers(kernelConnectionMetadata: KernelConnectionMetadata[]): boolean {
        // IANHU: Abstract base class possibility later?
        return kernelConnectionMetadata.some((connectionMetadata) => isWorkspaceLocalConnection(connectionMetadata));
    }

    public async create(): Promise<void> {
        const selectedInterpreter = await this.getInterpreter();

        if (selectedInterpreter) {
            await this.createVenv(selectedInterpreter);
        } else {
            // IANHU: Throw?
        }
    }

    private async getInterpreter(): Promise<PythonEnvironment | undefined> {
        const interpreterList = await this.interpreterService.getInterpreters();

        const quickPickInterpreters: IInterpreterQuickPickItem[] = interpreterList.map((interpreter) => {
            return { label: interpreter.displayName || 'Missing Display Name', interpreter: interpreter };
        });

        const interpreterSelected = await this.applicationShell.showQuickPick(quickPickInterpreters);

        if (interpreterSelected) {
            return interpreterSelected.interpreter;
        }
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

        // Now register a controller off of the created venv
        await this.registerController(workspaceDir);
    }

    private async registerController(workspaceDir: string) {
        const pythonPath = path.join(workspaceDir, '.venv', 'bin', 'python');
        const pythonUri = Uri.file(pythonPath);
        const interpreter = await this.interpreterService.getInterpreterDetails(pythonUri);

        if (!interpreter) {
            // IANHU: Failure case here
            return;
        }

        const kernelSpec = createInterpreterKernelSpec(interpreter);
        const id = getKernelId(kernelSpec, interpreter);
        const connectionMetadata: KernelConnectionMetadata = {
            kind: 'startUsingPythonInterpreter',
            kernelSpec,
            interpreter,
            id
        };
        this.controllerRegistration.add(connectionMetadata, [JupyterNotebookView, InteractiveWindowView]);
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

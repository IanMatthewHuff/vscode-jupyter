// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable } from 'inversify';
import { NotebookEditor, window } from 'vscode';
import { isPythonKernelConnection } from '../../kernels/helpers';
import { IControllerLoader, IControllerRegistration } from '../../notebooks/controllers/types';
import { IExtensionSingleActivationService } from '../../platform/activation/types';
import { IApplicationShell, ICommandManager } from '../../platform/common/application/types';
import { Commands } from '../../platform/common/constants';
import { ContextKey } from '../../platform/common/contextKey';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IDisposableRegistry } from '../../platform/common/types';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { IEnvironmentCreator } from './types';
import { VenvEnvironmentCreator } from './venvEnvironmentCreator';

// This class owns the command to create a local environment for kernel execution when there is not one available
// 1. Is there currently a locally scoped controller for the given file?
// 2. If not, add a command to the kernel picker to create one
// 3. Call out to the proper class to create one
@injectable()
export class EnvironmentCreateCommand implements IExtensionSingleActivationService {
    private showEnvironmentCreateCommand: ContextKey;
    private foundWorkspaceLocalControllers: boolean = false;
    private environmentCreators: IEnvironmentCreator[] = [];
    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IControllerLoader) private readonly controllerLoader: IControllerLoader,
        @inject(IControllerRegistration) private readonly controllerRegistration: IControllerRegistration,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IProcessServiceFactory) private readonly processServiceFactory: IProcessServiceFactory
    ) {
        // Context keys to control when these commands are shown
        this.showEnvironmentCreateCommand = new ContextKey('jupyter.showEnvironmentCreateCommand', this.commandManager);

        // Register to handle the kernel picker command
        this.disposables.push(
            this.commandManager.registerCommand(Commands.CreateEnvironment, this.createEnvironment, this)
        );

        // IANHU: This should probably end up as a multi-inject, just do this for now
        this.environmentCreators.push(
            new VenvEnvironmentCreator(
                this.interpreterService,
                this.appShell,
                this.processServiceFactory,
                this.controllerRegistration
            )
        );
    }

    public async activate(): Promise<void> {
        await this.showEnvironmentCreateCommand.set(false);

        this.disposables.push(this.controllerLoader.refreshed(this.onNotebookControllersLoaded, this));
    }

    private async createEnvironment(): Promise<void> {
        // IANHU: Bit of a pickle here, if multiple env creators are available which do we pick?
        // We could surface a user choice or a setting for pref. For now, just use the first
        if (this.environmentCreators.length > 0) {
            await this.environmentCreators[0].create();
        }
    }

    // When the active notebook changes, we need to check to see if we should show the command
    private async onDidChangeActiveNotebookEditor(editor: NotebookEditor | undefined) {
        if (editor && !this.foundWorkspaceLocalControllers) {
            // If we have an editor and we do not have workspace local controllers we want to see the command
            await this.showEnvironmentCreateCommand.set(true);
        } else {
            await this.showEnvironmentCreateCommand.set(false);
        }
    }

    // When controllers finish loading, check the open document
    private async onNotebookControllersLoaded() {
        this.foundWorkspaceLocalControllers = this.findWorkspaceLocalControllers();
        await this.onDidChangeActiveNotebookEditor(window.activeNotebookEditor);
    }

    // Given the currently registered controllers, are any of them workspace local?
    private findWorkspaceLocalControllers(): boolean {
        const pythonControllers = this.controllerRegistration.all.filter((item) => isPythonKernelConnection(item));

        const foundControllers = this.environmentCreators.some((environmentCreator) => {
            return environmentCreator.hasWorkspaceLocalControllers(pythonControllers);
        });

        // IANHU: Unneeded temp, just for debugging
        return foundControllers;
    }
}

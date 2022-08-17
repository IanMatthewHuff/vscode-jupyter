// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable, named } from 'inversify';
import { Memento, NotebookEditor, QuickPickItem, window } from 'vscode';
import { isPythonKernelConnection } from '../../kernels/helpers';
import { IInstaller } from '../../kernels/installer/types';
import { IKernelDependencyService } from '../../kernels/types';
import { KernelFilterService } from '../../notebooks/controllers/kernelFilter/kernelFilterService';
import { IControllerLoader, IControllerRegistration } from '../../notebooks/controllers/types';
import { IExtensionSingleActivationService } from '../../platform/activation/types';
import { IApplicationShell, ICommandManager } from '../../platform/common/application/types';
import { Commands } from '../../platform/common/constants';
import { ContextKey } from '../../platform/common/contextKey';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IDisposableRegistry, IMemento, WORKSPACE_MEMENTO } from '../../platform/common/types';
import { IMultiStepInputFactory } from '../../platform/common/utils/multiStepInput';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { CondaEnvironmentCreator } from './condaEnvironmentCreator';
import { IEnvironmentCreator } from './types';
import { VenvEnvironmentCreator } from './venvEnvironmentCreator';

interface ICreatorQuickPickItem extends QuickPickItem {
    creator: IEnvironmentCreator;
}

// This class owns the command to create a local environment for kernel execution when there is not one available
// 1. Is there currently a locally scoped controller for the given file?
// 2. If not, add a command to the kernel picker to create one
// 3. Call out to the proper class to create one
@injectable()
export class EnvironmentCreateCommand implements IExtensionSingleActivationService {
    private showEnvironmentCreateCommand: ContextKey;
    private foundWorkspaceLocalControllers: boolean = false;
    private availableCreator: boolean = false;
    private environmentCreators: IEnvironmentCreator[] = [];
    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(IControllerLoader) private readonly controllerLoader: IControllerLoader,
        @inject(IControllerRegistration) private readonly controllerRegistration: IControllerRegistration,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IProcessServiceFactory) private readonly processServiceFactory: IProcessServiceFactory,
        @inject(IKernelDependencyService) private readonly kernelDependencyService: IKernelDependencyService,
        @inject(IInstaller) private readonly installer: IInstaller,
        @inject(IMemento) @named(WORKSPACE_MEMENTO) private readonly workspaceMemento: Memento,
        @inject(KernelFilterService) private readonly kernelFilterService: KernelFilterService
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
                this.controllerRegistration,
                this.kernelDependencyService,
                this.installer
            ),
            new CondaEnvironmentCreator(
                this.interpreterService,
                this.processServiceFactory,
                this.workspaceMemento,
                this.appShell,
                this.controllerRegistration,
                this.controllerLoader,
                this.kernelFilterService
            )
        );
    }

    public async activate(): Promise<void> {
        await this.showEnvironmentCreateCommand.set(false);

        this.disposables.push(this.controllerLoader.refreshed(this.onNotebookControllersLoaded, this));

        // IANHU: This should probably not be in activate or should wait until requsted.
        this.availableCreator = await this.hasAvailableEnvironmentCreators();
    }

    private async createEnvironment(): Promise<void> {
        const selectedCreator = await this.selectCreator();

        if (selectedCreator) {
            await selectedCreator.create();
        }
    }

    // In cases where multiple creators are available, pick one
    private async selectCreator(): Promise<IEnvironmentCreator | undefined> {
        const availableCreators = this.environmentCreators.filter(async (creator) => {
            const avail = await creator.available();
            return avail;
        });

        const quickPickCreators: ICreatorQuickPickItem[] = availableCreators.map((creator) => {
            return { label: creator.displayName, creator };
        });

        const creatorSelected = await this.appShell.showQuickPick(quickPickCreators, {
            title: 'Select Environment Creator To Use:'
        });

        if (creatorSelected) {
            return creatorSelected.creator;
        }

        return undefined;
    }

    // When the active notebook changes, we need to check to see if we should show the command
    private async onDidChangeActiveNotebookEditor(editor: NotebookEditor | undefined) {
        if (editor && this.availableCreator && !this.foundWorkspaceLocalControllers) {
            // If we have an editor and we do not have workspace local controllers we want to see the command
            await this.showEnvironmentCreateCommand.set(true);
        } else {
            await this.showEnvironmentCreateCommand.set(false);
        }
    }

    // Do we have available ways to create an environment? Only need to run at the start once for now, but
    // long term might need / want to refresh on new installs
    private async hasAvailableEnvironmentCreators(): Promise<boolean> {
        const availableCreators = this.environmentCreators.some(async (environmentCreator) => {
            const avail = await environmentCreator.available();
            return avail;
        });

        return availableCreators;
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

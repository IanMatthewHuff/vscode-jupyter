// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { Memento } from 'vscode';
import { IInterpreterService } from '../../platform/interpreter/contracts';
import { KernelConnectionMetadata } from '../../kernels/types';
import { IEnvironmentCreator } from './types';
import { EnvironmentType } from '../../platform/pythonEnvironments/info';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { IMultiStepInputFactory } from '../../platform/common/utils/multiStepInput';
import { IApplicationShell } from '../../platform/common/application/types';
import { IControllerLoader, IControllerRegistration } from '../../notebooks/controllers/types';

const WorkspaceCondaControllerMappingKey = 'workspace-mapped-conda-env';

export class CondaEnvironmentCreator implements IEnvironmentCreator {
    private availablePromise: Promise<boolean> | undefined;
    constructor(
        private readonly interpreterService: IInterpreterService,
        private readonly processServiceFactory: IProcessServiceFactory,
        private readonly workspaceMemento: Memento,
        private readonly appShell: IApplicationShell,
        private readonly controllerRegistration: IControllerRegistration,
        private readonly controllerLoader: IControllerLoader
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

    public hasWorkspaceLocalControllers(_kernelConnectionMetadata: KernelConnectionMetadata[]): boolean {
        // Possible flow
        // 1. Is there a current conda env active?
        // IANHU: Figuring this out later?
        // 2. Have we mapped in a previous workspace?
        const mementoValue = this.workspaceMemento.get<string | undefined>(WorkspaceCondaControllerMappingKey);

        return !!mementoValue;
    }
    public async create(): Promise<void> {
        // Offer two options
        // 1. Select Existing Conda Env
        // 2. Create New Conda Env
        const selection = await this.selectExistingOrNewEnvironment();

        switch (selection) {
            case 'new':
                await this.createNewEnvironment();
                break;
            case 'existing':
                await this.linkWorkspaceWithExistingEnvironment();
                break;
            default:
                break;
        }
    }

    private async linkWorkspaceWithExistingEnvironment(): Promise<void> {}

    private async createNewEnvironment(): Promise<void> {}

    private async selectExistingOrNewEnvironment(): Promise<string | undefined> {
        const pickOptions: string[] = ['new', 'existing'];
        const selection = await this.appShell.showQuickPick(pickOptions, { title: 'Select Conda Env' });
        return selection;
    }

    // An interpreter exist which is a Conda interpreter
    private async checkAvailability(): Promise<boolean> {
        // IANHU: Maybe this should actually be if Conda is on the path?
        const interpreterList = await this.interpreterService.getInterpreters();

        const foundValidInterpreter = interpreterList.some((interpreter) => {
            return interpreter.envType === EnvironmentType.Conda;
        });

        return foundValidInterpreter;
    }
}

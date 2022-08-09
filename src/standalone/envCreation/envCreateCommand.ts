// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable } from 'inversify';
import { IControllerLoader, IControllerRegistration } from '../../notebooks/controllers/types';
import { IExtensionSingleActivationService } from '../../platform/activation/types';
import { IApplicationShell, ICommandManager } from '../../platform/common/application/types';
import { ContextKey } from '../../platform/common/contextKey';
import { IDisposableRegistry } from '../../platform/common/types';
import { ProgressReporter } from '../../platform/progress/progressReporter';

// This class owns the command to create a local environment for kernel execution when there is not one available
// 1. Is there currently a locally scoped controller for the given file?
// 2. If not, add a command to the kernel picker to create one
// 3. Call out to the proper class to create one
@injectable()
export class EnvironmentCreateCommand implements IExtensionSingleActivationService {
    private showEnvironmentCreateCommand: ContextKey;
    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(ProgressReporter) private readonly progressReporter: ProgressReporter,
        @inject(IControllerLoader) private readonly controllerLoader: IControllerLoader,
        @inject(IControllerRegistration) private readonly controllerRegistration: IControllerRegistration
    ) {
        // Context keys to control when these commands are shown
        this.showEnvironmentCreateCommand = new ContextKey('jupyter.showEnvironmentCreateCommand', this.commandManager);
    }
    public async activate(): Promise<void> {
        // IANHU: Just for now
        await this.showEnvironmentCreateCommand.set(true);
    }
}

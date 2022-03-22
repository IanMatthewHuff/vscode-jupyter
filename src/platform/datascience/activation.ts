// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../activation/types';
import { IPythonExtensionChecker } from '../api/types';
import '../common/extensions';
import { IPythonDaemonExecutionService, IPythonExecutionFactory } from '../common/process/types';
import { IDisposableRegistry } from '../common/types';
import { debounceAsync, swallowExceptions } from '../common/utils/decorators';
import { sendTelemetryEvent } from '../../telemetry';
import { JupyterDaemonModule, Telemetry } from './constants';
import { ActiveEditorContextService } from '../../interactive-window/commands/activeEditorContext';
import { IRawNotebookSupportedService } from './types';
import { IVSCodeNotebook } from '../common/application/types';
import { NotebookDocument } from 'vscode';
import { JupyterInterpreterService } from '../../kernels/jupyter/interpreter/jupyterInterpreterService';
import { isJupyterNotebook } from '../../notebooks/helpers';

@injectable()
export class Activation implements IExtensionSingleActivationService {
    private notebookOpened = false;
    constructor(
        @inject(IVSCodeNotebook) private readonly vscNotebook: IVSCodeNotebook,
        @inject(JupyterInterpreterService) private readonly jupyterInterpreterService: JupyterInterpreterService,
        @inject(IPythonExecutionFactory) private readonly factory: IPythonExecutionFactory,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(ActiveEditorContextService) private readonly contextService: ActiveEditorContextService,
        @inject(IRawNotebookSupportedService) private readonly rawSupported: IRawNotebookSupportedService,
        @inject(IPythonExtensionChecker) private readonly extensionChecker: IPythonExtensionChecker
    ) {}
    public async activate(): Promise<void> {
        this.disposables.push(this.vscNotebook.onDidOpenNotebookDocument(this.onDidOpenNotebookEditor, this));
        this.disposables.push(this.jupyterInterpreterService.onDidChangeInterpreter(this.onDidChangeInterpreter, this));
        void this.contextService.activate();
    }

    private onDidOpenNotebookEditor(e: NotebookDocument) {
        if (!isJupyterNotebook(e)) {
            return;
        }
        this.notebookOpened = true;
        void this.PreWarmDaemonPool();
        sendTelemetryEvent(Telemetry.OpenNotebookAll);

        if (!this.rawSupported.isSupported && this.extensionChecker.isPythonExtensionInstalled) {
            // Warm up our selected interpreter for the extension
            void this.jupyterInterpreterService.setInitialInterpreter();
        }
    }

    private onDidChangeInterpreter() {
        if (this.notebookOpened && !this.rawSupported.isSupported && this.extensionChecker.isPythonExtensionInstalled) {
            // Warm up our selected interpreter for the extension
            void this.jupyterInterpreterService.setInitialInterpreter();
            void this.PreWarmDaemonPool();
        }
    }

    @debounceAsync(500)
    @swallowExceptions('Failed to pre-warm daemon pool')
    private async PreWarmDaemonPool() {
        // Note: we're pre-warming the daemon pool for the interpreter we're using to start jupyter.
        // Thus if we're using raw kernels, then there's no point in pre-warming a daemon that will use
        // the interpreter for jupyter.
        if (!this.extensionChecker.isPythonExtensionActive || this.rawSupported.isSupported) {
            // Skip prewarm if no python extension or if we're using raw kernels.
            return;
        }
        const interpreter = await this.jupyterInterpreterService.getSelectedInterpreter();
        if (!interpreter) {
            return;
        }
        // Warm the daemon pool just for the interpreter used to start Jupyter.
        await this.factory.createDaemon<IPythonDaemonExecutionService>({
            daemonModule: JupyterDaemonModule,
            interpreter: interpreter
        });
    }
}
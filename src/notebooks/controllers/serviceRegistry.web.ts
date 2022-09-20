// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

'use strict';

import { IExtensionSingleActivationService, IExtensionSyncActivationService } from '../../platform/activation/types';
import { IServiceManager } from '../../platform/ioc/types';
import { ControllerDefaultService } from './controllerDefaultService';
import { ControllerLoader } from './controllerLoader';
import { ControllerPreferredService } from './controllerPreferredService';
import { ControllerRegistration } from './controllerRegistration';
import { ControllerSelection } from './controllerSelection';
import {
    IControllerDefaultService,
    IControllerLoader,
    IControllerPreferredService,
    IControllerRegistration,
    IControllerSelection,
    IKernelRankingHelper,
    INotebookKernelSourceSelector,
    INotebookKernelSourceTracker
} from './types';
import { registerTypes as registerWidgetTypes } from './ipywidgets/serviceRegistry.web';
import { KernelRankingHelper } from './kernelRanking/kernelRankingHelper';
import { NotebookKernelSourceSelector } from './kernelSource/notebookKernelSourceSelector';
import { NotebookKernelSourceTracker } from './kernelSource/notebookKernelSourceTracker';

export function registerTypes(serviceManager: IServiceManager, isDevMode: boolean) {
    serviceManager.addSingleton<IKernelRankingHelper>(IKernelRankingHelper, KernelRankingHelper);
    serviceManager.addSingleton<IControllerRegistration>(IControllerRegistration, ControllerRegistration);
    serviceManager.addSingleton<IControllerDefaultService>(IControllerDefaultService, ControllerDefaultService);
    serviceManager.addSingleton<IControllerLoader>(IControllerLoader, ControllerLoader);
    serviceManager.addBinding(IControllerLoader, IExtensionSingleActivationService);
    serviceManager.addSingleton<IControllerPreferredService>(IControllerPreferredService, ControllerPreferredService);
    serviceManager.addBinding(IControllerPreferredService, IExtensionSingleActivationService);
    serviceManager.addSingleton<IControllerSelection>(IControllerSelection, ControllerSelection);
    serviceManager.addSingleton<INotebookKernelSourceSelector>(
        INotebookKernelSourceSelector,
        NotebookKernelSourceSelector
    );
    serviceManager.addSingleton<INotebookKernelSourceTracker>(
        INotebookKernelSourceTracker,
        NotebookKernelSourceTracker
    );
    serviceManager.addBinding(INotebookKernelSourceTracker, IExtensionSyncActivationService);

    registerWidgetTypes(serviceManager, isDevMode);
}

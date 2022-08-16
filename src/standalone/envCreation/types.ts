// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { KernelConnectionMetadata } from '../../kernels/types';

// IANHU: This will probably be something like a multi-inject class, just make it simple for now
export interface IEnvironmentCreator {
    // Is this environment creator an available option on the system?
    available(): Promise<boolean>;
    // Do any of the given kernel connections qualify as a workspace local connection?
    hasWorkspaceLocalControllers(kernelConnectionMetadata: KernelConnectionMetadata[]): boolean;
    // Create an environment
    create(): Promise<void>;
}

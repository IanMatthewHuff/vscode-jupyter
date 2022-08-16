// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { KernelConnectionMetadata } from '../../kernels/types';
import { IEnvironmentCreator } from './types';

export class CondaEnvironmentCreator implements IEnvironmentCreator {
    public available(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    public hasWorkspaceLocalControllers(kernelConnectionMetadata: KernelConnectionMetadata[]): boolean {
        // Possible flow
        // 1. Is there a current conda env active?
        throw new Error('Method not implemented.');
    }
    public create(): Promise<void> {
        throw new Error('Method not implemented.');
    }
}

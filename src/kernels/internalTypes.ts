// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

'use strict';

import { Event } from 'vscode';
import { Resource } from '../platform/common/types';
import { KernelConnectionMetadata } from './types';

export interface IContributedKernelFinder extends IContributedKernelFinderInfo {
    kind: string;
    initialized: Promise<void>;
    onDidChangeKernels: Event<void>;
    listContributedKernels(resource: Resource): KernelConnectionMetadata[];
}

/*
 * Interface for just the display info of a contributed kernel finder.
 */
export interface IContributedKernelFinderInfo {
    id: string;
    displayName: string;
}

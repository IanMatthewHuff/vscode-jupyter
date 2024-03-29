// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { assert } from 'chai';
import * as fs from 'fs-extra';
import * as os from 'os';
import { anything, instance, mock, when } from 'ts-mockito';
import * as typemoq from 'typemoq';
import { Uri } from 'vscode';
import { ConfigurationService } from '../../../client/common/configuration/service';
import { IExtensionContext } from '../../../client/common/types';
import { DataScienceFileSystem } from '../../../client/datascience/dataScienceFileSystem';
import { DigestStorage } from '../../../client/datascience/interactive-ipynb/digestStorage';
import { TrustService } from '../../../client/datascience/interactive-ipynb/trustService';
import { MockMemento } from '../../mocks/mementos';

suite('DataScience - TrustService', () => {
    let trustService: TrustService;
    let alwaysTrustNotebooks: boolean = false;
    setup(() => {
        alwaysTrustNotebooks = false;
        const configService = mock(ConfigurationService);
        const fileSystem = mock(DataScienceFileSystem);
        const context = typemoq.Mock.ofType<IExtensionContext>();
        context.setup((c) => c.globalStoragePath).returns(() => os.tmpdir());
        const globalState = new MockMemento();
        context.setup((c) => c.globalState).returns(() => globalState);
        when(configService.getSettings()).thenCall(() => {
            // tslint:disable-next-line: no-any
            return { alwaysTrustNotebooks } as any;
        });
        when(fileSystem.appendLocalFile(anything(), anything())).thenCall((f, c) => fs.appendFile(f, c));
        when(fileSystem.readLocalFile(anything())).thenCall((f) => fs.readFile(f));
        when(fileSystem.createLocalDirectory(anything())).thenCall((d) => fs.mkdir(d));
        when(fileSystem.localDirectoryExists(anything())).thenCall((d) => fs.pathExists(d));
        const digestStorage = new DigestStorage(instance(fileSystem), context.object);
        trustService = new TrustService(digestStorage, instance(configService));
    });

    test('Trusting a notebook', async () => {
        const uri = Uri.file('foo.ipynb');
        await trustService.trustNotebook(uri, 'foobar');
        assert.ok(await trustService.isNotebookTrusted(uri, 'foobar'), 'Notebook is not trusted');
        assert.notOk(await trustService.isNotebookTrusted(uri, 'foobaz'));
    });
    test('Trusting a notebook with same path', async () => {
        const uri = Uri.file('foo.ipynb');
        const uri2 = Uri.file('FOO.ipynb');
        if (os.platform() === 'win32') {
            await trustService.trustNotebook(uri, 'foobar');
            assert.ok(await trustService.isNotebookTrusted(uri2, 'foobar'), 'Notebook is not trusted');
        }
    });
    test('Always trusting notebooks', async () => {
        alwaysTrustNotebooks = true;
        const uri = Uri.file('foo.ipynb');
        assert.ok(await trustService.isNotebookTrusted(uri, 'foobar'), 'Notebook is not trusted when all should be');
    });
});

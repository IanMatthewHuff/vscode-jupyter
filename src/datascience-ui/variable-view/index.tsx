// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

// This must be on top, do not change. Required by webpack.
import '../common/main';
// This must be on top, do not change. Required by webpack.

// tslint:disable-next-line: ordered-imports
import '../common/index.css';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider } from 'react-redux';

//import { IVariablePanelProps, VariablePanel } from '../interactive-common/variablePanel';
import { IVsCodeApi, PostOffice } from '../react-common/postOffice';
import { detectBaseTheme } from '../react-common/themeDetector';
import { createStore } from './redux/store';
import { VariableViewPanel } from './variableViewPanel';

// This special function talks to vscode from a web panel
export declare function acquireVsCodeApi(): IVsCodeApi;
const baseTheme = detectBaseTheme();
// tslint:disable-next-line: no-any
const testMode = (window as any).inTestMode;
// tslint:disable-next-line: no-typeof-undefined
const skipDefault = testMode ? false : typeof acquireVsCodeApi !== 'undefined';

// Create the redux store
const postOffice = new PostOffice();
// IANHU: Not directly passing test mode now, need to pass in a reducer map as well here
const store = createStore(true, postOffice, false);

// tslint:disable:no-typeof-undefined
ReactDOM.render(
    <Provider store={store}>
        <VariablePanel baseTheme={baseTheme} skipDefault={typeof acquireVsCodeApi !== 'undefined'} />
    </Provider>,
    document.getElementById('root') as HTMLElement
);

//ReactDOM.render(
//<Provider store={store}>
//<VariablePanel baseTheme={baseTheme} skipDefault={typeof acquireVsCodeApi !== 'undefined'} />
//</Provider>,
//document.getElementById('root') as HTMLElement
//);

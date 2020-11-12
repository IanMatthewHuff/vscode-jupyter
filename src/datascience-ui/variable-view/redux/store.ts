// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import * as Redux from 'redux';

import { PYTHON_LANGUAGE } from '../../../client/common/constants';
import { EXTENSION_ROOT_DIR } from '../../../client/constants';
import { Identifiers } from '../../../client/datascience/constants';
import { InteractiveWindowMessages } from '../../../client/datascience/interactive-common/interactiveWindowTypes';
import { MessageType } from '../../../client/datascience/interactive-common/synchronization';
import { BaseReduxActionPayload } from '../../../client/datascience/interactive-common/types';
import { CssMessages } from '../../../client/datascience/messages';
import { IJupyterExtraSettings } from '../../../client/datascience/types';
import { IFont } from '../../interactive-common/mainState';
import { isAllowedAction, isAllowedMessage, postActionToExtension } from '../../interactive-common/redux/helpers';
import { generatePostOfficeSendReducer } from '../../interactive-common/redux/postOffice';
import { generateVariableReducer, IVariableState } from '../../interactive-common/redux/reducers/variables';
import { addMessageDirectionMiddleware, createMiddleWare } from '../../interactive-common/redux/store';
import { getLocString } from '../../react-common/locReactSide';
import { PostOffice } from '../../react-common/postOffice';
import { combineReducers, createQueueableActionMiddleware, QueuableAction } from '../../react-common/reduxUtils';
import { computeEditorOptions, getDefaultSettings } from '../../react-common/settingsReactSide';

interface IVariableViewMainState {
    skipDefault: boolean;
    rootStyle?: string;
    rootCss?: string;
    font: IFont;
    vscodeThemeName?: string;
    baseTheme: string;
    knownDark: boolean;
    testMode?: boolean;
    codeTheme: string;
    settings?: IJupyterExtraSettings;
    loaded: boolean;
}

interface IStore {
    // IANHU: Should this be called main? I don't want all of main state
    variableViewMain: IVariableViewMainState;
    variables: IVariableState;
    post: {};
}
// IANHU: Very similar to interactive-common store.ts, combine / refactor?
export function createStore(
    skipDefault: boolean,
    showVariablesOnDebug: boolean,
    postOffice: PostOffice,
    testMode: boolean
) {
    // Generate the reduced view of the main state that just has what we need for Variable View
    const variableViewMainReducer = generateVariableViewMainReducer();

    // Create reducer to pass window messages to the other side
    const postOfficeReducer = generatePostOfficeSendReducer(postOffice);

    // Create another reducer for handling variable state
    const variableReducer = generateVariableReducer(showVariablesOnDebug);

    // Combine reducers
    const rootReducer = Redux.combineReducers<IStore>({
        variableViewMain: variableViewMainReducer,
        variables: variableReducer,
        post: postOfficeReducer
    });

    // Create our middleware
    const middleware = createMiddleWare(testMode, postOffice).concat([addMessageDirectionMiddleware]);

    // Use this reducer and middle ware to create a store
    const store = Redux.createStore(rootReducer, Redux.applyMiddleware(...middleware));

    // Make all messages from the post office dispatch to the store, changing the type to
    // turn them into actions.
    postOffice.addHandler({
        // tslint:disable-next-line: no-any
        handleMessage(message: string, payload?: any): boolean {
            // Double check this is one of our messages. React will actually post messages here too during development
            if (isAllowedMessage(message)) {
                const basePayload: BaseReduxActionPayload = { data: payload };
                if (message === InteractiveWindowMessages.Sync) {
                    // This is a message that has been sent from extension purely for synchronization purposes.
                    // Unwrap the message.
                    message = payload.type;
                    // This is a message that came in as a result of an outgoing message from another view.
                    basePayload.messageDirection = 'outgoing';
                    basePayload.messageType = payload.payload.messageType ?? MessageType.syncAcrossSameNotebooks;
                    basePayload.data = payload.payload.data;
                } else {
                    // Messages result of some user action.
                    basePayload.messageType = basePayload.messageType ?? MessageType.other;
                }
                store.dispatch({ type: message, payload: basePayload });
            }
            return true;
        }
    });

    return store;
}

function generateVariableViewMainReducer<M>(
    skipDefault: boolean,
    testMode: boolean,
    baseTheme: string,
    editable: boolean,
    reducerMap: M
): Redux.Reducer<IVariableViewMainState, QueuableAction<M>> {
    // First create our default state.
    const defaultState = generateVariableViewDefaultState(skipDefault, testMode, baseTheme, editable);

    // Then combine that with our map of state change message to reducer
    return combineReducers<IVariableViewMainState, M>(defaultState, reducerMap);
}

function generateVariableViewDefaultState(
    skipDefault: boolean,
    testMode: boolean,
    baseTheme: string
): IVariableViewMainState {
    return {
        // tslint:disable-next-line: no-typeof-undefined
        skipDefault,
        testMode,
        baseTheme: baseTheme,
        knownDark: false,
        font: {
            size: 14,
            family: "Consolas, 'Courier New', monospace"
        },
        codeTheme: Identifiers.GeneratedThemeName,
        loaded: false,
        settings: testMode ? getDefaultSettings() : undefined // When testing, we don't send (or wait) for the real settings.
    };
}

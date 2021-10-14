//import { Uri, workspace } from 'vscode';
import { Uri } from 'vscode';
import { injectable } from 'inversify';
import { IPythonScriptExporter } from './types';

// IANHU: injectable best for this? Looks like it could just be a static function

// The PythonScriptExporter is responsible only for
@injectable()
export class PythonScriptExporter implements IPythonScriptExporter {
    public export(_source: Uri): Promise<string> {
        //const _doc = workspace.notebookDocuments.find((doc) => doc.uri === source);

        return Promise.resolve('testing');
    }
}

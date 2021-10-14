import { NotebookCell, NotebookDocument, Uri, workspace } from 'vscode';
import { injectable } from 'inversify';
import { IPythonScriptExporter } from './types';
import { traceError } from '../../common/logger';

// IANHU: injectable best for this? Looks like it could just be a static function

// The PythonScriptExporter is responsible for turning a VS Code URI into a string of python text
@injectable()
export class PythonScriptExporter implements IPythonScriptExporter {
    public async export(source: Uri): Promise<string> {
        const docs = workspace.notebookDocuments;
        const doc = workspace.notebookDocuments.find((doc) => doc.uri === source);

        if (!doc) {
            // IANHU: Allow unknown return here? Should not get this situation
            traceError('Failed to find NotebookDocument for export');
            return '';
        }

        return this.exportDocument(doc);
    }

    private exportDocument(document: NotebookDocument): string {
        return document
            .getCells()
            .reduce((previousValue, currentValue) => previousValue + this.exportCell(currentValue), '');
    }

    private exportCell(_cell: NotebookCell): string {
        return 'testing';
    }
}

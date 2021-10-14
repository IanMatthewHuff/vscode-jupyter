import { inject, injectable } from 'inversify';
import { CancellationToken, Uri } from 'vscode';
import { IFileSystem } from '../../common/platform/types';
import { IExport2, IPythonScriptExporter } from './types';

@injectable()
export class ExportToPython2 implements IExport2 {
    constructor(
        @inject(IFileSystem) protected readonly fs: IFileSystem,
        @inject(IPythonScriptExporter) private readonly scriptExporter: IPythonScriptExporter
    ) {}
    public async export(source: Uri, target: Uri, token: CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }

        const contents = await this.scriptExporter.export(source);

        await this.fs.writeFile(target, contents);
    }
}

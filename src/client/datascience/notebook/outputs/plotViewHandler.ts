import { inject, injectable } from 'inversify';
import { NotebookCellOutputItem, NotebookEditor } from 'vscode';
import { traceError } from '../../../common/logger';
import { IFileSystem } from '../../../common/platform/types';
import { IDisposableRegistry } from '../../../common/types';
import { IPlotViewerProvider } from '../../types';

const svgMimeType = 'image/svg+xml';
const pngMimeType = 'image/png';

@injectable()
export class PlotViewHandler {
    constructor(@inject(IPlotViewerProvider) private readonly plotViewProvider: IPlotViewerProvider) {}

    public async openPlot(editor: NotebookEditor, outputId: string) {
        if (editor.document.isClosed) {
            return;
        }
        const outputItem = getOutputItem(editor, outputId, svgMimeType);
        let svgString: string | undefined;
        if (!outputItem) {
            // Didn't find svg, see if we have png we can convert
            const pngOutput = getOutputItem(editor, outputId, pngMimeType);

            if (!pngOutput) {
                return traceError(`No SVG or PNG Plot to open ${editor.document.uri.toString()}, id: ${outputId}`);
            }

            svgString = convertPngToSvg(pngOutput);
        } else {
            svgString = new TextDecoder().decode(outputItem.data);
        }
        if (svgString) {
            await this.plotViewProvider.showPlot(svgString);
        }
    }
}

function getOutputItem(editor: NotebookEditor, outputId: string, mimeType: string): NotebookCellOutputItem | undefined {
    for (const cell of editor.document.getCells()) {
        for (const output of cell.outputs) {
            if (output.id !== outputId) {
                continue;
            }
            return output.items.find((item) => item.mime === mimeType);
        }
    }
}

function convertPngToSvg(pngOutput: NotebookCellOutputItem): string {
    //return `<svg height="500" width="500">
    //<circle cx="250" cy="250" r="50" fill="#123456" />
    //</svg>`;
    const imageData = getImageData(pngOutput);
    return `<svg height="500" width="500">
    <g>
        <image xmlns="http://www.w3.org/2000/svg" x="0" y="0" height="500" width="500" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/png;base64,${imageData}"/>
    </g>
</svg>`;
    //return `<svg height="500" width="500">
    //<g>
    //<image xmlns="http://www.w3.org/2000/svg" id="image1PNG" x="240" y="150" width="240" height="150" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/png;base64,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"/>
    //</g>
    //</svg>`;
}

function getImageData(pngOutput: NotebookCellOutputItem): string {
    const testBuffer = Buffer.from(pngOutput.data);
    return testBuffer.toString('base64');
}

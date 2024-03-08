//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { colors: [] };

    /** @type {Array<{ value: string }>} */
    let colors = oldState.colors;

    document.querySelectorAll('#run-codemud').forEach(el => {
        el.addEventListener('click', () => {
            vscode.postMessage({
                type: 'runCodemud',
                path: el.getAttribute('data-path')
            });
        });
    });

    document.querySelectorAll('#open-codemud').forEach(el => {
        el.addEventListener('click', () => {
            vscode.postMessage({
                type: 'openCodemud',
                path: el.getAttribute('data-path')
            });
        });
    });
}());



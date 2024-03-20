// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const provider = new CodemudViewProvider(context.extensionUri);

	const webviewProvider = vscode.window.registerWebviewViewProvider(CodemudViewProvider.viewType, provider);

	context.subscriptions.push(webviewProvider);

	vscode.window.onDidChangeActiveTextEditor(() => {
		provider.updateWebView();
	});
}

class CodemudViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'codemud.view';
	private readonly codemudFolder = '.codemud';

	private _view?: vscode.WebviewView;
	private _codemuds: vscode.Uri[] = [];

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public async resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
		this._view = webviewView;
		this._codemuds = await this._getCodemuds();

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
			]
		};
		webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
		webviewView.onDidChangeVisibility(async () => {
			if(webviewView.visible) {
				webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
			}
		});
		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'runCodemud':
					{
						this._runCodemud(data.path);
						break;
					}
				case 'openCodemud':
					{
						vscode.workspace.openTextDocument(data.path).then((doc) => {
							vscode.window.showTextDocument(doc);
						});
						break;
					}
				case 'refreshCodemuds':
					{
						this._updateCodemuds();
						break;
					}
			}
		});
	}

	public async updateWebView() {
		if (this._view) {
			this._view.webview.html = await this._getHtmlForWebview(this._view.webview);
		}
	}

	private async _getHtmlForWebview(webview: vscode.Webview) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.path ?? '';
		const currentPath = vscode.window.activeTextEditor?.document.fileName.replace(workspaceFolder, '');

		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();
		
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<!--
				Use a content security policy to only allow loading styles from our extension directory,
				and only allow scripts that have a specific nonce.
				(See the 'webview-sample' extension sample for img-src content security policy examples)
			-->
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

			<meta name="viewport" content="width=device-width, initial-scale=1.0">

			<link href="${styleResetUri}" rel="stylesheet">
			<link href="${styleVSCodeUri}" rel="stylesheet">
			<link href="${styleMainUri}" rel="stylesheet">
			<link href="${codiconsUri}" rel="stylesheet" />
			<title>Codemud</title>
		</head>
		<body>
			<h1>Codemud</h1>
			<hr />
			<p>We're reading jscodeshift codemods from:</p>
			<code>${workspaceFolder}/.codemud/*.ts</code>
			<hr />
			<p>This is your current file (where the codemods will be applied):</p>
			<code>${currentPath}</code>
			<hr />
			<p>Click <i class="codicon codicon-play"></i> to run the codemod or <i class="codicon codicon-symbol-file"></i> to open it's source file</p>
			<div class="refresh-codemuds">
				Refresh codemuds:
				<button id="refresh-codemuds">
					<div class="icon"><i class="codicon codicon-refresh"></i></div>
				</button>
			</div>
			<ul>
				${this._codemuds.map((codemud) => `
					<li class="list-item">
						<span>${this._prettyPrintCodemud(codemud)}</span>
						<button id="run-codemud" data-path=${codemud.path}>
							<div class="icon"><i class="codicon codicon-play"></i></div>
						</button>
						<button id="open-codemud" data-path=${codemud.path}>
							<div class="icon"><i class="codicon codicon-symbol-file"></i></div>
						</button>
					</li>
				`).join('')}
				${this._codemuds.length === 0 ? '<p>No codemuds found</p>' : ''}
			</ul>

			<script nonce="${nonce}" src="${scriptUri}"></script>
		</body>
		</html>`;
	}

	private _prettyPrintCodemud(codemuds: vscode.Uri) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.path ?? '';
		const codemudsFolder = `${workspaceFolder}/${this.codemudFolder}`;
		const path = codemuds.path.replace(codemudsFolder, '');
		const fileName = path.split('/').pop()?.replace('.ts', '') || '';
		const prettyName = fileName.replace(/-/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
		return prettyName;
	}

	private _runCodemud(path: string) {
		console.log('Running codemud', path);
		const currentTextEditorPath = vscode.window.activeTextEditor?.document.fileName;
		const terminal = vscode.window.createTerminal('Codemud');
		terminal.sendText(`npx jscodeshift -t ${path} ${currentTextEditorPath}`);
		terminal.show();
	}

	private async _getCodemuds() {
		const codemuds = await vscode.workspace.findFiles(`${this.codemudFolder}/*.ts`, '**/node_modules/**');
		return codemuds.sort((a, b) => a.path.localeCompare(b.path));
	}

	private async _updateCodemuds() {
		this._codemuds = await this._getCodemuds();
		this.updateWebView();
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// This method is called when your extension is deactivated
export function deactivate() {}

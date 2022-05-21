import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class Dependency extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly script: string,
		public readonly desc: string,
		public readonly ljPath: string,
		public readonly args: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
		this.tooltip = `${this.label}`;
		this.description = this.desc;
		this.script = this.script;
		this.iconPath = '$(breakpoints-view-icon)';
	}
}

export class NodeDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
	constructor(private ljScriptsPath: string) {}
  
	setLJScriptsPath(ljPath: string) {
		this.ljScriptsPath = ljPath;
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
	  return element;
	}
  
	getChildren(element?: Dependency): Thenable<Dependency[]> {
	  if (!this.ljScriptsPath) {
		vscode.window.showInformationMessage('No dependency in empty workspace');
		return Promise.resolve([]);
	  }
  
	  if (element) {
		return Promise.resolve(
		  this.getScripts(
			path.join(this.ljScriptsPath, element.label, 'scripts.json')
		  )
		);
	  } 
	  else {
		const packageJsonPath = path.join(this.ljScriptsPath, 'scripts.json');
		if (this.pathExists(packageJsonPath)) {
		  return Promise.resolve(this.getScripts(packageJsonPath));
		} 
		else {
		  vscode.window.showInformationMessage('Workspace has no scripts.json');
		  return Promise.resolve([]);
		}
	  }
	}

	private getScripts( packagePath: string ) : Dependency[] {
		if ( this.pathExists(packagePath) ) {
			const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

			const toDep = (scriptName: string, script: string, desc: string, args: string): Dependency => {
				return new Dependency(
					scriptName,
					script,
					desc,
					this.ljScriptsPath,
					args,
					vscode.TreeItemCollapsibleState.None
				);
			};

			const scripts = packageJson.scripts
				? Object.keys(packageJson.scripts).map(dep =>
					toDep(dep, packageJson.scripts[dep].script, packageJson.scripts[dep].desc, packageJson.scripts[dep].args)
				)
				: [];

			return scripts;
		}
		else {
			return [];
		}

		return [];
	}
  
	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}
		return true;
	}

	private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | null | void> = new vscode.EventEmitter<Dependency | undefined | null | void>();
  	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}
}

function findDir(workPath: string, needle: string, isNotFirst: boolean | null): string | null {
	let files = fs.readdirSync(workPath);
	let hasFound;

	for (let file of files) {
		if (file == needle) {
			hasFound = path.join(workPath, file);
			break;
		}
	}
	
	if ( !hasFound ) {
		if ( !isNotFirst ) {
			for (let file of files) {
				let stats = fs.lstatSync( path.join(workPath, file) );
			
				if ( stats.isDirectory() ) {
					let found = findDir(path.join(workPath, file), needle, true);

					if (found) {
						return found;
					}
				}
			}
		}
		else {
			return null;
		}
	}
	else {
		return hasFound;
	}

	return null;
}

export function activate(context: vscode.ExtensionContext) {
	
	const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
		? vscode.workspace.workspaceFolders[0].uri.fsPath
		: "";

	const ljScriptsDir = findDir(rootPath, 'luajit-scripts', null);
	const provider = new NodeDependenciesProvider(ljScriptsDir != null ? ljScriptsDir : rootPath);

	let disposable = vscode.commands.registerCommand('luajit-scripts.refreshScripts', () => {
		const ljScriptsDir = findDir(rootPath, 'luajit-scripts', null);
		provider.setLJScriptsPath(ljScriptsDir != null ? ljScriptsDir : rootPath);
		
		provider.refresh();
	});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand('luajit-scripts.runScript', (node: Dependency, context: vscode.ExtensionContext) => {
		vscode.window.activeTerminal?.sendText('luajit -e "_PATH = [['+ node.ljPath +']]; package.path = string.gsub([[!PATH!\\?.lua;!PATH!\\?.luac;!PATH!\\?.dll;!PATH!\\..\\lua_modules\\?.lua;!PATH!\\..\\lua_modules\\?.luac;!PATH!\\..\\lua_modules\\?.dll]], \'!PATH!\', _PATH)" "' + path.join(node.ljPath, node.script) + '"' + ' ' + node.args );
	});
	context.subscriptions.push(disposable);

	vscode.window.registerTreeDataProvider(
		'luajit-scripts',
		provider
	);

	provider.refresh();

}

export function deactivate() {}

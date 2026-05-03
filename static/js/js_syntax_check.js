var fso = new ActiveXObject('Scripting.FileSystemObject');
var folder = fso.GetFolder('static\\js');
var files = new Enumerator(folder.Files);
var failed = false;
for (; !files.atEnd(); files.moveNext()) {
  var file = files.item();
  if (!/\.js$/i.test(file.Name)) continue;
  var text = fso.OpenTextFile(file.Path, 1).ReadAll();
  try {
    new Function(text);
    WScript.Echo('OK ' + file.Name);
  } catch (e) {
    failed = true;
    WScript.Echo('FAIL ' + file.Name + ' :: ' + e.message);
  }
}
if (failed) WScript.Quit(1);

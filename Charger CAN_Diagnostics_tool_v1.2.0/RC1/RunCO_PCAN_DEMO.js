var hexRegex = new RegExp('^([0-9a-f]{2} ?)+$', 'm');

// ****************************************************************************
function LoadAlarmIDToDes(idToDes)
{
    LoadIDToDes('-alarmToDes',idToDes);
}

// ****************************************************************************
function LoadFaultIDToDes(idToDes)
{
    LoadIDToDes('-faultToDes',idToDes);
}

// ****************************************************************************
function LoadHighPriAlmIDToDes(idToDes)
{
    LoadIDToDes('-hiPriAlmToDes',idToDes);
}

// ****************************************************************************
function LoadIDToDes(enumId, idToDes)
{
    document.body.style.cursor = "wait";
    var sessResPath = Start_Batch_Call('MetadataLookup.exe', 
                                       enumId, true);
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, true);
    var logContent = "";
    try 
    {
        logContent = flog.ReadAll();
    } catch (e)
    {
    }
    flog.Close();

    fso.DeleteFile(sessResPath);
    
    document.body.style.cursor = "default";
    
    var lines = logContent.split(/\r?\n/);
    for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) 
    {
        var thisLineParts = lines[lineIdx].split('|');
        idToDes[thisLineParts[0]] = thisLineParts[1];
    }
    
}

// ****************************************************************************
function RunChargerModelMetadataLookup(model, field)
{
    document.body.style.cursor = "wait";
    var sessResPath = Start_Batch_Call('MetadataLookup.exe', 
                                       '-chargersData ' + '-chargerModel ' + model + ' -field ' + field, true);
    
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, true);
    var logContent = "";
    try 
    {
        logContent = flog.ReadAll();
    } catch (e)
    {
    }
    flog.Close();

    fso.DeleteFile(sessResPath);
    
    document.body.style.cursor = "default";
    
    return logContent.split(/\r?\n/)[0];

}

// ****************************************************************************
function RunAlgoMetadataLookup(algo,field)
{
    document.body.style.cursor = "wait";
    var sessResPath = Start_Batch_Call('MetadataLookup.exe', 
                                       '-algoMetadata ' + '-algo ' + algo + ' -field ' + field, true);
    
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, true);
    var logContent = "";
    try 
    {
        logContent = flog.ReadAll();
    } catch (e)
    {
    }
    flog.Close();

    fso.DeleteFile(sessResPath);
    
    document.body.style.cursor = "default";
    
    if ( logContent.split(/\r?\n/)[0] == "False" )
    {
        return false;
    }
    if ( logContent.split(/\r?\n/)[0] == "True" )
    {
        return true;
    }
    return null;
}

// ****************************************************************************
function RunPassiveTrafficDetect(channel, baudRateGuessesList)
{
    var baudRateArg = '';
    for (var i = 0; i < baudRateGuessesList.length; i++) 
    {
        if ( baudRateArg == '' )
        {
            baudRateArg = baudRateGuessesList[i];
        } else {
            baudRateArg = baudRateArg + ',' + baudRateGuessesList[i];
        }
        
    }

    var args = ''
    if ( baudRateArg != '' )
    {
        args = '-br ' + baudRateArg;
    } else {
        return [];
    }
    
    args = args + ' -channel ' + channel;
    
    document.body.style.cursor = "wait";

    var sessResPath = Start_Batch_Call('PassiveTrafficDetect.exe', args, true);
    
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, true);
    var logContent = "";
    try 
    {
        logContent = flog.ReadAll();
    } catch (e) 
    {
    }
    flog.Close();

    fso.DeleteFile(sessResPath);
    
    document.body.style.cursor = "default";
    
    return logContent.split(/\r?\n/);
}

// ****************************************************************************
function RunCO_PCAN_Demo(args) 
{

	try
	{
		document.body.style.cursor = "wait";
	} catch(e)
	{		
	}
    var sessResPath = Start_Batch_Call('CO_PCAN_Demo.exe', args, true)
    
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, true);
    var logContent = "";
    try 
    {
        logContent = flog.ReadAll();
    } catch (e) 
    {
    }
    flog.Close();

    fso.DeleteFile(sessResPath);
    
	try
	{
		document.body.style.cursor = "default";
    } catch (e)
	{	
	}
	
    return logContent.split(/\r?\n/);
}

// ****************************************************************************
function Start_Batch_Call(cmd, params, waitOnReturn) 
{
    try 
    {
        var sessStr = (new Date()).getTime().toString();

        //TEMP until releasing new co_pcan_demo
        //var co_pcan_path = "V:\\Software\\Releases\\IC CAN Reprogramming\\WIP\\Mode 5";

        // First construct a Batch file
        var fso = new ActiveXObject('Scripting.FileSystemObject');            
        
        var documentPath = unescape(document.location);
        documentPath = documentPath.substring(0,documentPath.indexOf(".html"));
        var path = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name

        if (!fso.FolderExists(path + 'tmp')) {
            fso.CreateFolder(path + 'tmp');
        }

        var batchFile = fso.OpenTextFile(path + 'tmp/BatchCall' + sessStr + '.bat', 2, true);
        batchFile.WriteLine('call "' + path + cmd + '" ' + params + ' > "' + path + 'tmp/' + sessStr + '.out"');
        batchFile.Close();

        // Now call that batch file
        var tshell = new ActiveXObject("WScript.Shell");
        var tpath = 'cmd.exe /c "' + path + 'tmp/BatchCall' + sessStr + '.bat"';

        tshell.Run(tpath, 0, waitOnReturn);

        // Get the Stdout, piped to the output
        var sessResPath = path + 'tmp/' + sessStr + '.out';

        while (!fso.FileExists(sessResPath)) 
        {
        }
        
        // Delete the batch file
        //
        fso.DeleteFile(path + 'tmp/BatchCall' + sessStr + '.bat');
        
        return sessResPath;
        
    } catch (e) 
    {
        /*
         * Added for SSP-9635, add error handling
        */
        if (e == "ReferenceError: ActiveXObject is not defined") {
            alert("Unsupported browser. Please use Internet explorer.");
        }
        else {
            alert('Please enable ActiveX controls.' +
                'On Internet explorer, select the Tools button, and then select Internet options.' +
                'On the Security tab, select Custom level, and then under ActiveX controls and plug-ins, ' +
                'Select "enable" or "prompt" under "Initialize and script ActiveX controls not marked as safe for scripting".');
        }
    }
}

// ****************************************************************************
function GetBytesArrayFromReturnLines(returnLines) {
    var rawBytes = "";

    for (var j = 0; j < returnLines.length; j++) {
        var line = returnLines[j];
        if (hexRegex.test(line)) {
            rawBytes += line;
        }
        if (line.indexOf("ERROR") > -1 || line.indexOf("Error") > -1) {
            return null;
        }
    }

    if (rawBytes == "")
        return null;

    else {
        rawBytes = rawBytes.trim(); //Remove trailing spaces
        var bytesArray = rawBytes.split(" ");

        return bytesArray;
    }
}
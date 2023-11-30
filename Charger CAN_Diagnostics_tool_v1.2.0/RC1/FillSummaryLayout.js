// *****External device Auth*****
// If externalDeviceAuth = true & canUnhideKey is left blank, default key will be used
// If externalDeviceAuth = true & canUnhideKey is provided, that key will be used for external device authentication
// If externalDeviceAuth = false, no authentication, canUnhideKey will not be used
var externalDeviceAuth = false;
var canUnhideKey = "";

// *****Programming security*****
// If canSecurityKey is left blank, no auth
// If canSecurityKey is provided, that key will be used to program device(s).
var canSecurityKey = "";


var sdosToRetrieve =
[
    "1018,2", "1018,4", //Serial #
    "2241,0", //Active algo
    //"2275,0", //Cable resistance

    //cumulative counters
    "2500,1", "2500,2", "2500,3", "2500,4", "2500,5", "2500,6",
    "2500,7", "2500,8", "2500,9", "2500,10", "2500,11", "2500,12",
    "2500,13", "2500,14", "2500,15", "2500,16",

    "2242,0", //Installed algo count
    "100A,0", //Software version & variant
    
    "1003,0", //# of faults

    //crc
    "1f56,1","1f56,2","1f56,3","1f56,4"
]

var dsIdsToRetrieve =
[
    "0", "1", "4", "8", "9",
    "10", "15", "16", "17", "18",
    "19", "20", "21", "25", "27",
    "71", "75", "77", "86", "151", "156",
    "172", "174", "183", "234", "239",
    "241", "287", "288", "290", "293",
    "297", "309", "350", "365"
];

var tagValues = [];
var availableAlgoList = [];
var dsIdToValueMap = {};
var sdoToValueMap = {};
var selectedCharger;
var baudRate;
var baudRateAfterProg;
var nodeIdAfterProg;
var otherNodeIdToChangeBaudRate = [];
var defAlgoAfterProg;

var NO_ALGO_MESSAGE = "No algo set";
var NO_VALUE_MESSAGE = "No value found.";

var loadedHWVar = -1;

var HWVariantToName = 
{
    "8": "IC650",
    "20": "IC1200",
    "40": "IC900",
    "22": "Bosch",
    "23": "ICL/RC",
    "25": "Bosch Offboard",
	"51": "RQ350",
    "52": "RQ700",
    "100": "VCIM",
    "110": "IQ3K3LV"
}


//Escape key pressed
document.addEventListener("keypress", function (event)
{
    if (event.keyCode == 27)
    {
        document.getElementById("calculateResistanceSection").style.display = "none";
        document.getElementById("customerInfoContent").style.display = "none";
		document.getElementById("verifyInfoContent").style.display = "none";
    }
})

function Initialize() 
{

    var getParams = function (url) 
    {
        var params = {};
        var parser = document.createElement('a');
        parser.href = url;
        var query = parser.search.substring(1);
        var vars = query.split('&');
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split('=');
            params[pair[0]] = decodeURIComponent(pair[1]);
        }
        return params;
    };

    var params = getParams(window.location.href);
    selectedCharger = JSON.parse(params["charger"]);
    baudRate =  "baudRate" in selectedCharger ?
                selectedCharger.baudRate :
                GetStorageValue("br");
    

    //Hide unneccessary panels and html elements
    {
        document.getElementById("calculateResistanceSection").style.display = "none";
        document.getElementById("customerInfoContent").style.display = "none";
		document.getElementById("verifyInfoContent").style.display = "none";
        document.getElementById("submitAndCancelButton").style.visibility = "hidden";
        document.getElementById("Overlay").style.visibility = "hidden";
        CloseUpperTabs();
    }
	
	var bCrcCheck = CrcCheckCharger(selectedCharger["nodeId"]);

    if (bCrcCheck)
    {
        document.getElementById("TabsSection").style.display = "";
        document.getElementById("SummarySection").style.display = "";
        document.getElementById("ErrorText").innerHTML = "";

        SummaryButtonPressed();
        InitializeSummary();
    }
    else {
        document.getElementById("TabsSection").style.display = "none";
        document.getElementById("SummarySection").style.display = "none";
        document.getElementById("ErrorText").innerHTML = "No connection to device";
        return;
    }
}

//********************************************************************
function InitializeSummary() 
{    
    if ( loadedHWVar != -1 )
    {
        var detectedDevices = {};
        var detectAttempts = 20;
                        
        var detectedDevices = {};
        while( detectAttempts > 0 )
        {
            detectedDevices = GetDevices([baudRateAfterProg,"125","250","500","1000"], 
                                         selectedCharger["channel"], 
                                         selectedCharger["programmerCobId"], 
                                         selectedCharger["chargerCobId"], 
                                         false);
            
            if ( detectedDevices["list"].length == 0 )
            {   
                PauseInLoop(3000);
                detectAttempts = detectAttempts - 1;
                
            } else 
            {
                break;
            }
            
        }
        
        // select the specific item from the detected device that matches the loadedHWVar
        
        if ( detectedDevices["br"] != null )
        {
            baudRate = detectedDevices["br"];            
            for (var i = 0; i < detectedDevices["list"].length; i++) 
            {
                if ( detectedDevices["list"][i]["hwVar"] == loadedHWVar )
                {
                    try 
                    {
                        window.external.RefreshNodeIDTabTitle(selectedCharger["nodeId"], detectedDevices["list"][i]["nodeId"], baudRate);
                    } catch (err )
                    {
                    }
                    
                    selectedCharger["nodeId"] = detectedDevices["list"][i]["nodeId"];
                    break;
                }
            }            
        }
        
    }

    document.title = "Node ID: " + selectedCharger["nodeId"];
    
    ExternalDeviceAuthentication();
    
    {
        // silent this charger first
        //
        RunCO_PCAN_Demo_WithOverlay("-mode 102" +
                                    " -br " + baudRate +
                                    " -tout 1" +
                                    " -nodeId " + selectedCharger["nodeId"] +
                                    " -channel " + selectedCharger["channel"],
                                    "HB/PDOs Off");
    }
    
    var hWVariant = GetChargerHWVariant(selectedCharger["nodeId"]);
    // First check if device supports reading values from dsID
    // if software version is 5.x.x or greater, we can read DsIds
    //Otherwise, we are only able to read from SDO
    // First, try read 100A subindex 0 for software version
    //
    // In addition, hide battery cumulative counters if software version is < 9.5
    var readDsId = true;
    var part1Start = Date.now();
    {
        if (selectedCharger == null || selectedCharger == undefined) 
        {
            alert("No device selected");
            return;
        }
        // Summary should only be disabled on a charger,
        // For VCIM, we will assume that we can read the values
        if (!(hWVariant >= 100 && hWVariant <= 110)) 
        {
            var error = "";

            var bytesArray = GetValueFromCharger("4106", "0", "1", selectedCharger["nodeId"], selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], selectedCharger["channel"]);

            if (bytesArray == null) 
            {
                //If failed to read 100A, try read 1018 SubIndex 3 for > 0x00020004
                var bytesArray = GetValueFromCharger("4120", "3", "1", selectedCharger["nodeId"], selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], selectedCharger["channel"]);

                if (bytesArray == null) {
                    readDsId = false;
                } else {
                    if (parseInt(bytesArray[0] + bytesArray[1] + bytesArray[2] + bytesArray[3], 16) < 0x00020004) {
                        readDsId = false;
                    }
                }
            }
            else 
            {
                try 
                {
                    var interp = InterpretType(ASCII, bytesArray);
                    var swMajor = parseInt(interp.split('.')[0]);
                    if (swMajor < 5) 
                    {
                        readDsId = false;
                    }
                    var swMinor = parseInt(interp.split('.')[1]);
                    var table = document.getElementById("cumulativeCountersTable");
                    var rows = table.getElementsByTagName('tr');

                    //Hide battery cumulative counters
                    if (swMajor < 9 || (swMajor == 9 && swMinor < 5)) {
                        for (var row = 0; row < rows.length; row++) {
                            var cels = rows[row].getElementsByTagName('td')
                            cels[2].setAttribute("class", "hide");
                        }
                    }
                    //Unhide battery cumulative counters
                    else {
                        for (var row = 0; row < rows.length; row++) {
                            var cels = rows[row].getElementsByTagName('td')
                            cels[2].setAttribute("class", "");
                        }
                    }
                } catch (e) 
                {
                    readDsId = false;
                }
            }
        }
    }
    var part1Dur = Date.now() - part1Start;

    // Hide battery cumulative counters on secondary chargers
    // And make it so it deosn't read dsId's on secondary chargers because
    //  Reading dsIds on secondary chargers over CANOpen is not possible
    if (selectedCharger["isSecondary"] == "true") 
    {
        var table = document.getElementById("cumulativeCountersTable");
        var rows = table.getElementsByTagName('tr');

        for (var row = 0; row < rows.length; row++) {
            var cels = rows[row].getElementsByTagName('td')
            cels[2].setAttribute("class", "hide");
        }

        readDsId = false;
    }

    var part2Start = Date.now();
    //Get bytes using SDO
    {
        var error = "";
        var callStr =
            "-mode 101" +
            " -br " + baudRate +
            " -tout " + "2" +
            " -nodeId " + selectedCharger["nodeId"] +
            " -programmer_COBId " + selectedCharger["programmerCobId"] +
            " -charger_COBId " + selectedCharger["chargerCobId"] +
            " -channel " + selectedCharger["channel"];

        callStr += " -rdIdxAndSubIdxArray "

        sdosToRetrieve.forEach(function (sdo) {
            var split = sdo.split(',');
            var readIdx = split[0];
            var readSubIdx = split[1];

            callStr += parseInt(readIdx, 16).toString() + "," + readSubIdx + ",";
        })
        callStr = callStr.substring(0, callStr.length - 1); //Remove last ','

        var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Retrieving Info.");

        var sdoIndex = -1; //Current index reading from 
        for (var i = 0; i < returnLines.length; i++) {
            var line = returnLines[i];

            if (line.indexOf("START READ") != -1) { //Look for keywork READ SDO, then the bytes following after this keywork will be the corresponding bytes.
                sdoIndex++;
                error = "";
                rawBytes = "";
            }
            else if (line.indexOf("END READ") != -1) {
                if (error != "") {
                    sdoToValueMap[sdosToRetrieve[sdoIndex]] = error;
                }
                else {
                    try {
                        rawBytes.trim();
                        var bytesArray = rawBytes.split(' ');
                        var split = sdosToRetrieve[sdoIndex].split(',');
                        var readIdx = split[0];
                        var readSubIdx = split[1];
                        sdoToValueMap[sdosToRetrieve[sdoIndex]] = InterpretSDO(readIdx, readSubIdx, bytesArray);
                    } catch (errorMsg) {
                        sdoToValueMap[sdosToRetrieve[sdoIndex]] = errorMsg;
                    }
                }
            }
            else if (error == "" && line.indexOf("Failed") != -1) //Override error
            {
                error = "Failed to retrieve value.";
            }
            else if (hexRegex.test(line)) {
                rawBytes += line;
            }
        }
    }
    var part2Dur = Date.now() - part2Start;

    var part3Start = Date.now();
    //Get bytes from device using DS interface
    if (readDsId == true) 
    {
        var dsIdsCallString = "";
        for (var i = 0; i < dsIdsToRetrieve.length; i++) {
            dsIdsCallString += dsIdsToRetrieve[i];
            if (i != dsIdsToRetrieve.length - 1)
                dsIdsCallString += ",";
        }

        var returnLines = RunCO_PCAN_Demo_WithOverlay(
            "-mode 4"
            + " -br " + baudRate
            + " -tout " + "1"
            + " -nodeId " + selectedCharger["nodeId"]
            + " -dsId " + dsIdsCallString
            + " -programmer_COBId " + selectedCharger["programmerCobId"]
            + " -charger_COBId " + selectedCharger["chargerCobId"]
            + " -channel " + selectedCharger["channel"],
            "Retrieving Info..");

        var dsIdIndex = -1; //Current index reading from (dsIdsToRetrieve)
        var error, rawBytes;

        for (var i = 0; i < returnLines.length; i++) {
            var line = returnLines[i];
            if (line.indexOf("READ DSID") != -1) { //Look for keywork READ DSID, then the bytes following after this keywork will be the corresponding bytes.
                dsIdIndex++;
                error = "";
                rawBytes = "";
            }
            else if (line.indexOf("END READ") != -1) {
                if (error != "") {
                    dsIdToValueMap[dsIdsToRetrieve[dsIdIndex]] = error;
                }
                else {
                    try {
                        rawBytes.trim();
                        var bytesArray = rawBytes.split(' ');
                        dsIdToValueMap[dsIdsToRetrieve[dsIdIndex]] = InterpretDS(dsIdsToRetrieve[dsIdIndex], bytesArray);
                    } catch (errorMsg) {
                        dsIdToValueMap[dsIdsToRetrieve[dsIdIndex]] = errorMsg;
                    }
                }
            }
            else if (error == "" && line.indexOf("ErrorCodeAdditional") != -1) //Override error
            {
                error = "Failed to retrieve value.";
            }
            else if (hexRegex.test(line)) {
                rawBytes += line;
            }
        }

        //device will be restarted after reading dsIds, wait for it turn back on before reading dsIds
        //while (!CrcCheckCharger(selectedCharger["nodeId"])) 
        //{

        //}
    }
    else {

        if (selectedCharger["isSecondary"] == "true") {
            for (var i = 0; i < dsIdsToRetrieve.length; i++) {
                dsIdToValueMap[dsIdsToRetrieve[i]] = "Unsupported by secondary charger."
            }
        }
        else {
            for (var i = 0; i < dsIdsToRetrieve.length; i++) {
                dsIdToValueMap[dsIdsToRetrieve[i]] = "Unsupported by software."
            }
        }
    }
    var part3Dur = Date.now() - part3Start;

    var part4Start = Date.now();
    

    //Fill available charging profiles table (And select list in active algo field)
    GetAvailableChargingProfiles();

    var part4Dur = Date.now() - part4Start;

    var part5Start = Date.now();
    
    //Show faults and alarms
    GetFaultsAndAlarms();

    var part5Dur = Date.now() - part5Start;

    var part6Start = Date.now();
    
    //Get tag values
    tagValues = [
        {
            "Tag": "serialNumber",
            "Value": GetSerialNumber(selectedCharger["nodeId"])
        },
        {
            "Tag": "chargerModel",
            "Value": dsIdToValueMap["1"]
        },
        {
            "Tag": "deltaQFGA",
            "Value": dsIdToValueMap["71"]
        },
        {
            "Tag": "customerHWPartNumber",
            "Value": dsIdToValueMap["239"]
        },
        {
            "Tag": "customerSWPartNumber",
            "Value": dsIdToValueMap["287"]
        },
        {
            "Tag": "customerAssemblyPartNumber",
            "Value": dsIdToValueMap["288"]
        },
        {
            "Tag": "customerModelName",
            "Value": dsIdToValueMap["290"]
        },
        {
            "Tag": "customerSerialNumber",
            "Value": dsIdToValueMap["293"]
        },
        {
            "Tag": "overallCRC",
            "Value": sdoToValueMap["1f56,1"]
        },
        {
            "Tag": "swVersionAndVariant",
            "Value": sdoToValueMap["100A,0"]
        },
        {
            "Tag": "activeAlgo",
            "Value": GetActiveAlgo()
        },
        {
            "Tag": "batteryCapacity",
            "Value": dsIdToValueMap["172"]
        },
        {
            "Tag": "batteryPackTargetVoltage",
            "Value": dsIdToValueMap["174"]
        },
        {
            "Tag": "totalCharges_charger",
            "Value": sdoToValueMap["2500,1"]
        },
        {
            "Tag": "totalCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 0)
        },
        {
            "Tag": "completedCharges_charger",
            "Value": sdoToValueMap["2500,6"]
        },
        {
            "Tag": "completedCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 5)
        },
        {
            "Tag": "opportunisticCharges_charger",
            "Value": sdoToValueMap["2500,9"]
        },
        {
            "Tag": "opportunisticCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 8)
        },
        {
            "Tag": "equalisationCharges_charger",
            "Value": sdoToValueMap["2500,7"]
        },
        {
            "Tag": "equalisationCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 6)
        },
        {
            "Tag": "acInterruptedCharges_charger",
            "Value": sdoToValueMap["2500,11"]
        },
        {
            "Tag": "acInterruptedCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 10)
        },
        {
            "Tag": "dcInterruptedCharges_charger",
            "Value": sdoToValueMap["2500,10"]
        },
        {
            "Tag": "dcInterruptedCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 9)
        },
        {
            "Tag": "maintenanceCharges_charger",
            "Value": sdoToValueMap["2500,8"]
        },
        {
            "Tag": "maintenanceCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 7)
        },
        {
            "Tag": "equivalentFullCharges_charger",
            "Value": sdoToValueMap["2500,12"]
        },
        {
            "Tag": "equivalentFullCharges_battery",
            "Value": GetOffset(dsIdToValueMap["365"], 11)
        },
        {
            "Tag": "maxCurrent",
            "Value": dsIdToValueMap["297"]
        },
        {
            "Tag": "maxVoltage",
            "Value": dsIdToValueMap["309"]
        },
        {
            "Tag": "shutdownTime",
            "Value": GetShutdownTime()
        },
        {
            "Tag": "acCycleStopTime",
            "Value": GetAcCycleStopTime()
        },
        {
            "Tag": "cableResistance",
            //"Value": sdoToValueMap["2275,0"]
            "Value": dsIdToValueMap["4"]
        },
        {
            "Tag": "nodeId",
            "Value": dsIdToValueMap["151"]
        },
        {
            "Tag": "baudRate",
            "Value": dsIdToValueMap["156"]
        }
    ];

    /* Hide fields for VCIM
    * VCIM will have hardware variants 100-110, anything else will be a charger
    *
    * For VCIM, only these fields should be shown:
    * 1. Serial Number
    * 2. Model
    * 3. Delta-Q FGA
    * 4. Customer HW Part number
    * 5. Customer SW part number
    * 6. Customer assembly part number
    * 7. Customer model name
    * 8. Customer serial number
    * 9. SW version and variant
    * 10. NodeID
    * 11. BaudRate
    */
    CancelModifyMode();
    {
        if (hWVariant >= 100 && hWVariant < 110)
        {
            document.getElementById("summaryPart2").style.display = "none";
            document.getElementById("calculateResistanceSection").style.display = "none";
            document.getElementById("summaryCumulativeCounters").style.display = "none";
            document.getElementById("#AvailableChargingProfiles_section").style.display = "none";
        }
    }

    /* Check if device is stackable system, disable modifying if it is
     * We need to read Ds ID: 241 DS_ID_PARALLEL_CHG_CONTROL, to see if we are connected to a stackable system
     * <doc>Control word for parallel charging.
     * Bit 0: Indicates if parallel charging is enabled. <-- we need to check this
     * Bits 3:1 Reserved. Leave set to zero
     * Bits 7:4 Indicate the expected number of secondary chargers. 0 - means variable number, 1-5 indicates a fixed number is expected
     * Bits 15:8 Reserved. Leave set to zero</doc>
     */
    {

        if (selectedCharger["isSecondary"] == "true") {
            //Means stackable, disable modify here
            document.getElementById("modifyButton").style.display = "none";
        }
        else {
            var val = dsIdToValueMap["241"];
            if (!isNaN(val)) {
                if (val % 2 == 1) {
                    //Means stackable, disable modify here
                    document.getElementById("modifyButton").style.display = "none";
                }
            }
        }
    }

    //Show stackable devices list in programming section
    document.getElementById("chargerListText").innerHTML = "Node IDs to be programmed: " + "Node " + selectedCharger["nodeId"];
    for (var i = 0; i < selectedCharger["secondaryChargers"].length; i++)
    {
        document.getElementById("chargerListText").innerHTML += ", " + "Node " + selectedCharger["secondaryChargers"][i].toString();
    }

    //Show/Hide stackable log download button
    if (selectedCharger["secondaryChargers"].length > 0)
    {
        document.getElementById("logDownloadStackButton").style.display = "";
    }
    else {
        document.getElementById("logDownloadStackButton").style.display = "none";
    }

    //Fill fields in html
    for (var i = 0; i < tagValues.length; i++)
    {
        var element = document.getElementById(tagValues[i]["Tag"]);
        if (element != undefined)
        {
            element.innerHTML = tagValues[i]["Value"];
        }
        var modifyElement = document.getElementById(tagValues[i]["Tag"] + "_modify");
        if (modifyElement != undefined)
        {
            modifyElement.style.display = "none";
        }
    }

    //Show warning if no algo selected
    if (GetActiveAlgo() == NO_ALGO_MESSAGE)
    {
        document.getElementById("algoWarningIcon").style.display = "inline-block";
        alert("This charger does not have an algo set, please select an algo.");
    }
    else {
        document.getElementById("algoWarningIcon").style.display = "none";
    }
    
    var part6Dur = Date.now() - part6Start;

    var part7Start = Date.now();
    

    //OnProgramFileChanged();
    
    var part7Dur = Date.now() - part7Start;

}
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
function RunCO_PCAN_Demo_WithOverlay(params, overlayText) {

    try {
        document.getElementById("Overlay").style.visibility = "visible";
        document.getElementById("OverlayText").innerHTML = overlayText;
    } catch (e) {

    }
    var returnLines = RunCO_PCAN_Demo(params);

    try {
        document.getElementById("Overlay").style.visibility = "hidden";
    } catch (e) {

    }

    return returnLines;
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
function RunPassiveTrafficDetect_WithOverlay( channel, baudRateGuessList, overlayText )
{
    try 
    {
        document.getElementById("Overlay").style.visibility = "visible";
        document.getElementById("OverlayText").innerHTML = overlayText;
    } catch (e) 
    {
    }
    
    var returnLines = RunPassiveTrafficDetect(channel, baudRateGuessList);
    
    try 
    {
        document.getElementById("Overlay").style.visibility = "hidden";
    } catch (e) 
    {
    }
    
    if ( returnLines.length == 0 )
    {
        return "";
    } else 
    {
        return returnLines[0];
    }

}


function GetOffset(array, offset) {
    if (!Array.isArray(array) || offset >= array.length) {
		return array; //Returns error
	}
	else {
		return array[offset];
	}
}

function CrcCheckCharger(nodeId) 
{
	
    var callStr = "-mode 1 " +
        " -br " + baudRate +
        " -tout " + "1" +
        " -nodeId " + nodeId +
        " -rdIdx " + "8022" +
        " -rdSubIdx " + "1" +
        " -rdSize " + "4" +
        " -channel " + selectedCharger["channel"] +
        " -programmer_COBId " + selectedCharger["programmerCobId"] +
        " -charger_COBId " + selectedCharger["chargerCobId"];

	var attempt = 3;
    var found = false;
	
	while ( attempt > 0 &&
			!found )
	{
		var crcCheck = RunCO_PCAN_Demo_WithOverlay(callStr, "Verifying connection...");

		var thisAttemptFailed = false;
		for (var m = 0; m < crcCheck.length; m++) 
		{
			if (crcCheck[m].indexOf("Failed") != -1) 
			{
				thisAttemptFailed = true;
			}
		}
		if ( !thisAttemptFailed )
		{
			found = true;
		}
		attempt = attempt - 1;
	}

    return found;
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************

function VerifyRange(num, min, max) {
    if (num == undefined || num == "")
        return undefined;

    if (parseFloat(num) >= min && parseFloat(num) <= max)
        return num;
    else {
        throw "Input not in range! Valid range: " + min.toString() + "-" + max.toString();
    }
}

/*
 * We can retrieve the number of algos using object 2242.
 * We can retrieve algo information with object 2244, but we first need to indicate
 * which algo we are requesting by modifying object 2243
 * 
 * So to retrieve available charging profiles (algos list) using sdo,
 * 1. Get # of algos with 2242
 * 2. Set 2243 to index 0
 * 3. Retrieve algo info with 2243
 * 4. Increase 2243 index, read with 2244, repeat for # of algos
 */
function GetAvailableChargingProfiles() {

    availableAlgoList = [];

    var table = document.getElementById("#AvailableChargingProfiles_table")

    table.innerHTML = "";
    //header
    {
        var header = table.createTHead();
        var row = header.insertRow(0);
        var cell = row.insertCell(0);
        cell.innerHTML = "<b>Available charging profile(s)</b>";
    }

    var algoCount = sdoToValueMap["2242,0"];

    //Loop for each algo

    try {
        for (var i = 0; i < algoCount; i++) 
        {
            var writeValue = i.toString();
            while (writeValue.length < 2) {
                //Pad with 0's
                writeValue = "0" + writeValue;
            }

            //Change read index 
            {
                var callStr = "-mode 2" +
                    " -br " + baudRate +
                    " -tout " + "1" +
                    " -nodeId " + selectedCharger["nodeId"] +
                    " -channel " + selectedCharger["channel"] +
                    " -programmer_COBId " + selectedCharger["programmerCobId"] +
                    " -charger_COBId " + selectedCharger["chargerCobId"] +
                    " -wrIdx " + parseInt("2243", 16).toString() +
                    " -wrSubIdx 0" +
                    " -wrSize 1" +
                    " -wrVal " + writeValue;

                var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Retrieving algos.");
            }

            //Retrieve index algo
            var algoBytesArray;
            {
                var callStr = "-mode 1" +
                    " -br " + baudRate +
                    " -tout " + "1" +
                    " -nodeId " + selectedCharger["nodeId"] +
                    " -channel " + selectedCharger["channel"] +
                    " -programmer_COBId " + selectedCharger["programmerCobId"] +
                    " -charger_COBId " + selectedCharger["chargerCobId"] +
                    " -rdIdx " + parseInt("2244", 16).toString() +
                    " -rdSubIdx 0" +
                    " -rdSize 1";

                var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Retrieving algos..");
                algoBytesArray = GetBytesArrayFromReturnLines(returnLines);
            }

            /*
             * The returned 32-bit value is encoded as follows:
             * Bits 15:0  - Algorithm Id
             * Bits 23:16 - Algorithm minor version
             * Bits 31:24 - Algorithm major version
             */
            {
                var algoProfile = parseInt(algoBytesArray[1] + algoBytesArray[0], 16);
                if (algoProfile == "65535")
                    continue;
                var major = parseInt(algoBytesArray[3], 16);

                var minor = parseInt(algoBytesArray[2], 16);
                if (minor < 10)
                    minor = "0" + minor.toString();
            }

            availableAlgoList.push({
                profile: algoProfile,
                major: major,
                minor: minor,
                profileBytes: algoBytesArray[1] + algoBytesArray[0],
                dsVal: algoBytesArray[0] + algoBytesArray[1] + algoBytesArray[2] + "00" + algoBytesArray[3] + "00"
            });
        }
    } catch (e) {
        var newRow = table.insertRow();
        var versionCell = newRow.insertCell(0);
        var versionNode = document.createTextNode("Failed to retrieve algos.");
        versionCell.appendChild(versionNode);
        return;
    }

    var selectElement = document.getElementById("activeAlgo_modify");
    selectElement.innerHTML = "";

    availableAlgoList.forEach(function (algo) {
        var algoString = "Algo " + "#" + algo["profile"] + " v" + algo["major"] + "." + algo["minor"];
        //Fill out active charging profile list
        {
            var newRow = table.insertRow();
            var versionCell = newRow.insertCell(0);
            var versionNode = document.createTextNode(algoString);

            if (algoString == GetActiveAlgo()) {
                versionCell.setAttribute("class", "highlight"); //Highlight selected algo
            }
                    
            versionCell.appendChild(versionNode);
        }
        //Fill out selection list in active algo
        {
            var newOption = document.createElement("option");

            // Here, we are constructing the bytes when we modify the sdo
            //
            // Definitions:
            // Active algorithm ID.  The lower 16-bits store the ID.  The upper 16-bits are a bitfield determining the permanence of the selection:
            // Bit #15  of the upper 16 - bit: algorithm selection permanence
            // bit clear: Select algorithm this time only. (it takes effect until a software reset)
            // bit set: Store selection permanently.
            //
            // E.g.  Selecting Profile #11 permanently: 0x8000000B
            // Selecting profile #11 non - permanently: 0x0000000B
            //
            // We want to store selection permenently so we want the bytes to be in format: 0x8000 + 16 bits algoId
            //
            {
                var constructedBytes = "";
                constructedBytes += "8000"

                var thisProfile = algo["profileBytes"];

                constructedBytes += thisProfile;
                newOption.setAttribute("value", constructedBytes);
                newOption.setAttribute("profile", parseInt(algo["profileBytes"], 16));
                newOption.setAttribute("major", parseInt(algo["major"]), 16);
                newOption.setAttribute("minor", parseInt(algo["minor"]), 16);
                newOption.setAttribute("dsVal",algo["dsVal"]);
            }
            newOption.text = algoString;
            newOption.class += " black";
            selectElement.add(newOption);
        }
    })
}


function GetActiveAlgo() {
    var activeAlgoProfile = sdoToValueMap["2241,0"];

    for (var i = 0; i < availableAlgoList.length; i++) {

        var algo = availableAlgoList[i];

        if (activeAlgoProfile.toString() == algo["profile"].toString()) {
            return "Algo " + "#" + algo["profile"] + " v" + algo["major"] + "." + algo["minor"];
        }
    }
    if (activeAlgoProfile == 0xFFFFFFFF) {
        return NO_ALGO_MESSAGE;
    }
    else {
        return "Unknown";
    }
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************

/*
 * Added for SSP-9637: Write/Read select charger configuration settings
 * 
 * - Read Time for the charger to have lost AC before it stops the current charger cycle - with options Never, Instant or a Time.
 *       Never:  AC_CHG_SUSPEND_DISABLE = True, MAX_AC_SUSPEND_TIME_MS == don't care
 *       Instant: AC_CHG_SUSPEND_DISABLE = False, MAX_AC_SUSPEND_TIME_MS = 0
 *       Time:    AC_CHG_SUSPEND_DISABLE = False, MAX_AC_SUSPEND_TIME_MS = <SECS> or Milli secs, or some other scaling
*/
function GetAcCycleStopTime() {

    var suspendDisable = dsIdToValueMap["86"];

    if (isNaN(suspendDisable)) {
        return suspendDisable; //Return error
    }

    if (suspendDisable == true) {
        return "Never";
    }
    else {

        var suspendTime = dsIdToValueMap["77"];
        if (isNaN(suspendTime)) {
            return suspendTime; //Return error
        }

        if (suspendTime == 0) {
            return "Instant";
        }
        else if (suspendTime == 600000) {
            return "10 minutes";
        }
        else if (suspendTime == 1000) {
            return "1 second";
        }
        else {
            return suspendTime.toString() + "ms";
        }
    }
}

/*
 * Added for SSP-9637: Write/Read select charger configuration settings
 * 
 * - Write Time for the charger to have lost AC before it stops the current charger cycle - with options Never, Instant or a Time.
 *       Never:  AC_CHG_SUSPEND_DISABLE = True, MAX_AC_SUSPEND_TIME_MS == don't care
 *       Instant: AC_CHG_SUSPEND_DISABLE = False, MAX_AC_SUSPEND_TIME_MS = 0
 *       Time:    AC_CHG_SUSPEND_DISABLE = False, MAX_AC_SUSPEND_TIME_MS = <SECS> or Milli secs, or some other scaling
*/
function GetAcCycleStopTimeField() {
    var fieldValue = document.getElementById("acCycleStopTime_modify").value;

    if (fieldValue == "Instant") {
        return { "suspendDisable": "00", "suspendTime": "00000000" }
    }
    else if (fieldValue == "Never") {
        return { "suspendDisable": "01", "suspendTime": "00000000" }
    }
    else {
        var fieldToInt = TextToBytes(fieldValue, "uint32");

        if (fieldToInt == undefined) {
            return { "suspendDisable": undefined, "suspendTime": undefined }
        }
        else {
            return { "suspendDisable": "00", "suspendTime": fieldToInt }
        }
    }
}

/*
 * Added for SSP-9637: Write/Read select charger configuration settings
 * Read Time for the charger to shutdown when running on DC only - Options should be Never, or a time,
*/
function GetShutdownTime() {
    /*
     *     Shutdown timeout, in milliseconds. 
     *     
     *     for newer chargers: read dsId 350, A DC-powered charger will shutdown after this many milliseconds.
     *     This timeout will only take effect if DS_ID_SHDNTIMEOUT_HRS (75) is configured to be zero.
     *     & shutdownDisable (234) is set to false
     *     
     *     For older chargers without dsId 350, read dsId 234
    */
    var shutdownTimems = dsIdToValueMap["350"];
    var shutdownTimeoutHrs = dsIdToValueMap["75"];
    var shutdownDisable = dsIdToValueMap["234"];

    //Print never if shutdown is disabled
    if (!isNaN(shutdownDisable) && shutdownDisable == true) {
        return "Never";
    }

    else if (!isNaN(shutdownTimems)) {
        if (shutdownTimeoutHrs== 0) {
            //Return dsId 350 value if 234 is set to 0
            return shutdownTimems / 1000 + "s";
        }
    }

    //Return dsId 234 value
    if (!isNaN(shutdownTimeoutHrs)) {
        return shutdownTimeoutHrs / 1000 + "s";
    }

    //return error
    return shutdownTimeoutHrs;

}

/*
 * Added for SSP-9637: Write/Read select charger configuration settings
 * Write Time for the charger to shutdown when running on DC only - Options should be Never, or a time,
 * 
 * For old chargers, minimum time = 1 hour (Set with dsId 75) and maximum of 49 days
 * For chargers with dsId 234 added, Charger shutdown time can be set to infinity by disabling dsId 234
 * For new chargers with DsId 350, Minimum time can be set to 1 second with dsId 350
*/
function GetShutdownField() {
    var fieldValue = document.getElementById("shutdownTime_modify").value;

    var shutdownTimems = dsIdToValueMap["350"];
    var shutdownDisable = dsIdToValueMap["234"];

    //Disable shutdown if option = "Never"
    if (fieldValue == "Never") {
        return { "shutdownDisable": "01", "shutdownTimems": undefined, "shutdownTimeoutHrs": undefined }
    }

    //Return undefined if input is incorrect
    var fieldToBytes = TextToBytes(fieldValue + "000", "uint32"); //Convert seconds to milliseconds then to bytes
    if (fieldToBytes == undefined) {
        throw "Input not a number!";
    }

    //Check if device has dsId 350
    if (!isNaN(shutdownTimems)) {
        //if device has dsId 350, it supports minimum shutdown time of 1 second
        if (parseInt(fieldValue) < 1) {
            throw "Shutdown time too low, requires >= 1s";
        }
		else if (fieldValue === "")
		{
			return { "shutdownDisable": undefined, "shutdownTimems": undefined, "shutdownTimeoutHrs": undefined }
		}
        else if (parseInt(fieldValue) > 4233600) 
		{
            //When shutdown time is greater than 49 days, disable shutdown time
            return { "shutdownDisable": "01", "shutdownTimems": undefined, "shutdownTimeoutHrs": undefined }
        }
        else 
		{
            //Set dsId 350 to input time
            return { "shutdownDisable": "00", "shutdownTimems": TextToBytes(fieldValue + "000", "uint32"), "shutdownTimeoutHrs": "0000" }
        }
    }
    else {
        //if device does not has dsId 350, it supports minimum shutdown time of 1 hour
        if (parseInt(fieldValue) < 3600) {
            throw "Shutdown time too low, requires >= 3600s";
        }
        //When shutdown time is greater than 49 days, disable shutdown time if dsId 234 exists
        else if (parseInt(fieldValue) > 4233600) {
            if (!isNaN(shutdownDisable)) {
                //If dsId 234 exists, disable shutdown
                return { "shutdownDisable": "01", "shutdownTimems": undefined, "shutdownTimeoutHrs": undefined }
            }
            else {
                throw "Shutdown time too large! Requires <= 4233600s";
            }
        }
        else {
            //Set dsId 234 to input time
            return { "shutdownDisable": "00", "shutdownTimems": fieldToBytes, "shutdownTimeoutHrs": TextToBytes(fieldValue + "000", "uint16") }
        }
    }
}

/*
 *  Added for SSP-9637: Write/Read select device configuration settings
 *  The device needs to restart in order for any modified device values to take effect.
*/
function ResetCharger(nodeId) 
{
	/*
    RunCO_PCAN_Demo_WithOverlay("-mode 2"
        + " -br " + baudRate
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -wrIdx 16384"
        + " -wrSubIdx 0"
        + " -wrSize 2"
        + " -wrVal 21930"
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -channel " + selectedCharger["channel"],
        "Resetting device...");
	*/
	RunCO_PCAN_Demo_WithOverlay("-mode 102" + 
								" -br " + baudRate + 
								" -tout 1" +
								" -nodeIdArray " + nodeId +
								" -programmer_COBId " + selectedCharger["programmerCobId"] +
								" -charger_COBId " + selectedCharger["chargerCobId"] +
								" -channel " + selectedCharger["channel"], 
								"Reset device...");
        
}

/*
 *  Added for SSP-9637: Write/Read select device configuration settings
 *  
 *  This function translates user input for modification into bytes to store into device
*/
function TextToBytes(text, type) {
    if (text == "" || text == undefined) {
        return undefined;
    }
    switch (type)     
    {
        case ("battCapTarVolt"):
            {
                var num = text;
                var floatView = new Float32Array(1);
                floatView[0] = num;
                var intView = new Uint8Array(floatView.buffer);
                var result = "";

                for (var i = 0; i < intView.length; i++) {
                    var hexString = intView[i].toString(16);
                    while (hexString.length < 2) {
                        hexString = "0" + hexString;
                    }
                    result += hexString
                }
                return result;
            }
        case ("float32"):
            {
                var num = text;
                var floatView = new Float32Array(1);
                floatView[0] = num;
                var intView = new Uint8Array(floatView.buffer);
                var result = "";

                for (var i = intView.length - 1; i >= 0; i--) {
                    var hexString = intView[i].toString(16);
                    while (hexString.length < 2) {
                        hexString = "0" + hexString;
                    }
                    result += hexString
                }
                return result;
            }
        case ("float32_big_endian"):
            {
                var num = text;
                var floatView = new Float32Array(1);
                floatView[0] = num;
                var intView = new Uint8Array(floatView.buffer);
                var result = "";

                for (var i = 0; i < intView.length; i++) {
                    var hexString = intView[i].toString(16);
                    while (hexString.length < 2) {
                        hexString = "0" + hexString;
                    }
                    result += hexString
                }
                return result;
            }
        case ("uint32"):
            {
                if (isNaN(text)) {
                    alert("Modified field value is not a number!");
                    return undefined; //If text is not a number, return undefined
                }

                hexString = parseInt(text).toString(16);
                while (hexString.length < 8) {
                    hexString = "0" + hexString;
                }
                var hexStringFlippedBytes = "";

                for (var i = hexString.length - 2; i >= 0; i -= 2) {
                    hexStringFlippedBytes += hexString[i] + hexString[i + 1];
                }
                return hexStringFlippedBytes;
            }
        case ("uint16"):
            {
                if (isNaN(text)) {
                    alert("Modified field value is not a number!");
                    return undefined; //If text is not a number, return undefined
                }

                hexString = parseInt(text).toString(16);
                while (hexString.length < 4) {
                    hexString = "0" + hexString;
                }
                var hexStringFlippedBytes = "";

                for (var i = hexString.length - 2; i >= 0; i -= 2) {
                    hexStringFlippedBytes += hexString[i] + hexString[i + 1];
                }
                return hexStringFlippedBytes;
            }
        case ("uint8"):
            {
                if (isNaN(text)) {
                    alert("Modified field value is not a number!");
                    return undefined; //If text is not a number, return undefined
                }

                hexString = parseInt(text).toString(16);
                while (hexString.length < 2) {
                    hexString = "0" + hexString;
                }
                return hexString;
            }

        default:
            return undefined;
    }
}

/*
 *  Added for SSP-9637: Write/Read select device configuration settings
*/
function ModifyDsId(nodeId, dsId, bytes) {
    var callStr = "-mode 5"
        + " -br " + baudRate
        + " -tout " + "5"
        + " -nodeId " + nodeId
        + " -dsId " + dsId
        + " -dsInpVal " + bytes
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -channel " + selectedCharger["channel"];
    RunCO_PCAN_Demo_WithOverlay(callStr, "Modifying values...");
}

function ModifySDO(sdoIdx, sdoSubIdx, size, bytes) {
    var callStr = "-mode 2"
        + " -br " + baudRate
        + " -tout " + "5"
        + " -nodeId " + selectedCharger["nodeId"]
        + " -wrIdx " + parseInt(sdoIdx, 16).toString()
        + " -wrSubIdx " + parseInt(sdoSubIdx, 16).toString()
        + " -wrSize " + size
        + " -wrVal " + parseInt(bytes, 16).toString()
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -channel " + selectedCharger["channel"];

    var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Modifying values...");
}

/*
 *  Added for SSP-9637: Write/Read select device configuration settings
*/
function SubmitButtonPressed() 
{
    ExternalDeviceAuthentication();
    
	// First set the active algo
	// because all config parameter values MAY be changed (to baseConfig or AAC)
	// thus, this needs to happen first.
	//
	{
		//Warn user if algo does not support scaling and a number is set
		var modifyAlgoElement = document.getElementById("activeAlgo_modify");
		if (modifyAlgoElement.selectedIndex > -1 &&
			modifyAlgoElement.options[modifyAlgoElement.selectedIndex].innerHTML !=
			document.getElementById("activeAlgo").innerHTML)
		{
			var selectedAlgoProfile = modifyAlgoElement.options[modifyAlgoElement.selectedIndex].getAttribute("profile");
			var algoSupportsCapacityScaling = GetAlgoBoolField(selectedAlgoProfile, "AlgoSupportsCapacityScaling");
			if (!algoSupportsCapacityScaling && document.getElementById("batteryCapacity").innerHTML != NO_VALUE_MESSAGE) 
			{
				alert("The algo selected does not support battery pack capacity scaling. The field should be cleared before switching to this algo.");
			}
			var algoSupportsVoltageScaling = GetAlgoBoolField(selectedAlgoProfile, "AlgoSupportsVoltageScaling");
			if (!algoSupportsVoltageScaling && document.getElementById("batteryPackTargetVoltage").innerHTML != NO_VALUE_MESSAGE) 
			{
				alert("The algo selected does not support battery pack target voltage scaling. The field should be cleared before switching to this algo.");
			}
			
			var oldDS151ReturnLines = RunCO_PCAN_Demo_WithOverlay(	"-mode 4" + 
																	" -br " + baudRate + 
																	" -tout " + "1" + 
																	" -nodeId " + selectedCharger["nodeId"] + 
																	" -dsId " + "151" + 
																	" -programmer_COBId " + selectedCharger["programmerCobId"] + 
																	" -charger_COBId " + selectedCharger["chargerCobId"] + 
																	" -channel " + selectedCharger["channel"],
																	"Read nodeId before active algo change..");
																	
			var oldNodeIdByteArray = GetBytesArrayFromReturnLines(oldDS151ReturnLines);
			var oldNodeId = InterpretDS(151, oldNodeIdByteArray);
			
			// Modify active algo as a special case
			ModifyDsId(	selectedCharger["nodeId"],
						"27",
						modifyAlgoElement.options[modifyAlgoElement.selectedIndex].getAttribute("dsVal") );
			
			ResetCharger(selectedCharger["nodeId"]);
			
			// THIS NEEDS TO BE DETECTED, AS 
			// THE CURRENT NODEID CAN BE BLOWN AWAY
			//
			var numOfDetectDeviceTry = 10;
			
			while ( numOfDetectDeviceTry > 0 )
			{
				var devices = GetDevices([baudRate], 
										 selectedCharger["channel"], 
										 selectedCharger["programmerCobId"], 
										 selectedCharger["chargerCobId"], 
										 false);
				var devicesList = devices["list"];

				if ( devicesList != null &&
					 devicesList.length > 0 )
				{
					numOfDetectDeviceTry = 0;
					for (var i = 0; i < devicesList.length; i++) 
					{        				
						selectedCharger["nodeId"] = devicesList[i]["nodeId"];																
					}		

					// the nodeId has been modified with user intervention
					//
					// thus, we want to fake it as if the user enter 
					// the modified value into the field, to keep it
					//
					/*
					if ( selectedCharger["nodeId"] != parseInt(document.getElementById("nodeId").innerHTML) )
					{
						document.getElementById("nodeId_modify").value = document.getElementById("nodeId").innerHTML;
					}
					*/
					if (document.getElementById("nodeId_modify").value == "" && 
						oldNodeId != selectedCharger["nodeId"] )
					{
						var promptText = "Changed Active Algo has changed CAN Node Id \n\n" +
						                 "\tfrom " + oldNodeId + "\n" +
                                         "\tto " + selectedCharger["nodeId"] + "\n\n" +
										 "OK to reset Node Id back to " + oldNodeId + "\n" +
										 "Cancel to leave Node Id at " + selectedCharger["nodeId"] + "\n";
						if ( confirm(promptText) == true )
						{
							document.getElementById("nodeId_modify").value = oldNodeId;
						}
					}
				} else 
				{
					numOfDetectDeviceTry = numOfDetectDeviceTry - 1;
				}					
			}			
        }
	}
	
	// Change node ID
	// 
	{
		if (document.getElementById("nodeId_modify").value != "") 
		{
			var proposedNodeId = document.getElementById("nodeId_modify").value;

			if (parseInt(proposedNodeId) > 127 || parseInt(proposedNodeId) < 0) 
			{
				alert("NodeID out of range! Valid range 1-127");
				return;
			}
			else if (CrcCheckCharger(proposedNodeId)) 
			{
				alert("Device with that node ID already exists");
				return;
			}
			else 
			{
				var befNodeId = selectedCharger["nodeId"];
				ModifyDsId(selectedCharger["nodeId"], "151", TextToBytes(proposedNodeId, "float32_big_endian"));			
				selectedCharger["nodeId"] = parseInt(proposedNodeId);
				//window.location.replace('SummaryLayout.html?charger=' + JSON.stringify(selectedCharger));
			
				ResetCharger(befNodeId);
			
				while (!CrcCheckCharger(selectedCharger["nodeId"])) 
				{
				}
			}
        }
    }
		
	if (selectedCharger == undefined || selectedCharger == null) 
	{
		alert("No device selected!");
		return;
	}

	// Change the rest, that does not require rescanning after
	{
		try 
		{
			var modifyValues = 
			[
				{
					"DSID": "172",
					"Value": TextToBytes(VerifyBatteryCapacityRange(document.getElementById("batteryCapacity_modify").value), "battCapTarVolt")
				},
				{
					"DSID": "174",
					"Value": TextToBytes(VerifyTargetVoltageRange(document.getElementById("batteryPackTargetVoltage_modify").value), "battCapTarVolt")
				},
				{
					"DSID": "297",
					"Value": TextToBytes(document.getElementById("maxCurrent_modify").value, "battCapTarVolt")
				},
				{
					"DSID": "309",
					"Value": TextToBytes(document.getElementById("maxVoltage_modify").value, "battCapTarVolt")
				},
				{
					"DSID": "86",
					"Value": GetAcCycleStopTimeField()["suspendDisable"]
				},
				{
					"DSID": "77",
					"Value": GetAcCycleStopTimeField()["suspendTime"]
				},
				{
					"DSID": "350",
					"Value": GetShutdownField()["shutdownTimems"]
				},
				{
					"DSID": "75",
					"Value": GetShutdownField()["shutdownTimeoutHrs"]
				},
				{
					"DSID": "234",
					"Value": GetShutdownField()["shutdownDisable"]
				},
				/*
				{
					"SDOIndex": "2275",
					"SDOSubIdx": "0",
					"Size": "1",
					"Value": TextToBytes(VerifyRange(document.getElementById("cableResistance_modify").value, 0, 150), "uint8")
				},
				*/
				{
					"DSID": "4",
					"Value": TextToBytes(
									(   parseFloat( (   document.getElementById("cableResistance_modify").value == "" ? 
														dsIdToValueMap["4"]: 
														document.getElementById("cableResistance_modify").value
												  ) )  / 1000
									).toString(), 
									"battCapTarVolt")
				}
				/*,
				
				{
					"SDOIndex": "2241",
					"SDOSubIdx": "0",
					"Size": "4",
					"Value": document.getElementById("activeAlgo_modify").value
				}
				*/
			]
		} catch (errorMsg) {
			alert(errorMsg)
			return;
		}

		for (var i = 0; i < modifyValues.length; i++) 
		{
			
			//Modify dsId
			if (modifyValues[i]["DSID"] != undefined) 
			{
				var bytes = modifyValues[i]["Value"];
				if (bytes != "" && bytes != undefined) {
					ModifyDsId(selectedCharger["nodeId"], modifyValues[i]["DSID"], bytes);
				}
			}
			//Modify SDO
			else if (modifyValues[i]["SDOIndex"] != undefined) 
			{
				var readIdx = modifyValues[i]["SDOIndex"];
				var readSubIdx = modifyValues[i]["SDOSubIdx"];
				var size = modifyValues[i]["Size"];
				var bytes = modifyValues[i]["Value"];

				if (bytes != "" && bytes != undefined) 
				{
					ModifySDO(readIdx, readSubIdx, size, bytes);
				}
			}
		}	
	}
    

    //Modify BaudRate
	/*
    resetNodeIdStr = "";
    if (document.getElementById("baudRate_modify").value != "") 
    {
        var proposedBaudRate = document.getElementById("baudRate_modify").value;
        var devices = GetDevices([baudRate], selectedCharger["channel"], selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], false);
        var devicesList = devices["list"];

        for (var i = 0; i < devicesList.length; i++) 
        {        
            ModifyDsId(devicesList[i]["nodeId"], "156", TextToBytes(proposedBaudRate, "float32_big_endian"));
            // ResetCharger(devicesList[i]["nodeId"]);
            
            if (resetNodeIdStr == "")
            {
                resetNodeIdStr = devicesList[i]["nodeId"];
            }
            else
            {
                resetNodeIdStr = resetNodeIdStr + "," + devicesList[i]["nodeId"];
            }
            
            for (var j = 0; j < devicesList[i]["secondaryChargers"].length; j++) 
            {
                var secondaryNodeId = devicesList[i]["secondaryChargers"][j];
                ModifyDsId(secondaryNodeId, "156", TextToBytes(proposedBaudRate, "float32_big_endian"));
                resetNodeIdStr = "," + secondaryNodeId;
            }
        }
        
        RunCO_PCAN_Demo_WithOverlay("-mode 102" + 
                                    " -br " + baudRate + 
                                    " -tout 1" +
                                    " -nodeIdArray " + resetNodeIdStr +
                                    " -programmer_COBId " + selectedCharger["programmerCobId"] +
                                    " -charger_COBId " + selectedCharger["chargerCobId"] +
                                    " -channel " + selectedCharger["channel"], 
                                    "Multi-thread Reset Chargers...");
        
        WriteToStorage("br", proposedBaudRate);
        baudRate = proposedBaudRate;
    }
	*/
	
    while (!CrcCheckCharger(selectedCharger["nodeId"])) 
    {
	}
	
	InitializeSummary();
}

/*
 *  Added for SSP-9637: Write/Read select device configuration settings
*/
function ModifyButtonPressed() {

    document.getElementById("modifyButton").style.display = "none";
    document.getElementById("submitAndCancelButton").style.visibility = "visible";

    //Load algos metadata xml and see if we algo supports capacity scaling
    //var activeAlgoProfile = sdoToValueMap["2241,0"];
    var activeAlgoProfile = dsIdToValueMap["27"].split(" ")[1].replace("#","");

    var algoSupportsCapacityScaling = GetAlgoBoolField(activeAlgoProfile, "AlgoSupportsCapacityScaling");
    var algoSupportsVoltageScaling = GetAlgoBoolField(activeAlgoProfile, "AlgoSupportsVoltageScaling");

    for (var i = 0; i < tagValues.length; i++) {

        var elementModifiable = true;

        var element = document.getElementById(tagValues[i]["Tag"]);
        var modifyElement = document.getElementById(element.id + "_modify");

        if (modifyElement == undefined) {
            elementModifiable = false;
        }
        //Fields: acCycleStopTime & shutdownTime should only be modifiable on IC series chargers
        else if (modifyElement.id == "acCycleStopTime_modify" || modifyElement.id == "shutdownTime_modify") {

            var versionResult = dsIdToValueMap["1"];
            if (versionResult.indexOf("IC") == -1 ||
                versionResult.indexOf("ICL") != -1) {

                elementModifiable = false;
            }
        }
        // Fields: Battery pack capacity & battery pack target voltage should be only modifiable on chargers with active algo that supports it
        // We can find out if the current active algo supports changing these fields by looking at "AlgoSupportsCapacityScaling" tag in Support/AlgoMetadata.xml
        else if (modifyElement.id == "batteryCapacity_modify") {
            elementModifiable = algoSupportsCapacityScaling;
        }
        else if (modifyElement.id == "batteryPackTargetVoltage_modify") {
            elementModifiable = algoSupportsVoltageScaling;
        }
        else if (modifyElement.id == "nodeId_modify") 
		{
			//elementModifiable = false;
        }
        else if (modifyElement.id == "baudRate_modify") {
            elementModifiable = false;
        }    

        if (elementModifiable == true) {
            element.style.display = "none";
            modifyElement.style.display = "";
            modifyElement.value = "";

            if (modifyElement.nodeName == "INPUT") {
                modifyElement.setAttribute("placeholder", element.innerHTML);
                modifyElement.value = "";
            }
            else if (modifyElement.nodeName == "SELECT") {
                //The placeholder attribute will not work for a select element, do this instead,
                //This will select the option with the set value automatically
                for (var j = 0; j < modifyElement.options.length; j++) {
                    if (modifyElement.options[j].innerHTML == element.innerHTML) {
                        modifyElement.selectedIndex = j;
                        modifyElement.style.color = "grey";
                    }
                }
            }
        } else {
            element.style.color = "grey";
        }

        if (modifyElement != undefined) {
            var clearElement = document.getElementById(element.id + "_clear");
            if (clearElement != null && clearElement != undefined) {
                //Case when no value set, hide the clear button
                if (element.innerHTML == NO_VALUE_MESSAGE) {
                    clearElement.style.display = "none";
                }
                else {
                    clearElement.style.display = "";
                }
            }
        }
    }
}

// ****************************************************************************
function OnAlgoDropDownChanged() {

    var modifyElement = document.getElementById("activeAlgo_modify");
    var selectedAlgoProfile = modifyElement.options[modifyElement.selectedIndex].getAttribute("profile");

    var capacityElement = document.getElementById("batteryCapacity");
    var capacityModifyElement = document.getElementById("batteryCapacity_modify");
    var voltageElement = document.getElementById("batteryPackTargetVoltage");
    var voltageModifyElement = document.getElementById("batteryPackTargetVoltage_modify");

    var algoSupportsCapacityScaling = GetAlgoBoolField(selectedAlgoProfile, "AlgoSupportsCapacityScaling");
    if (algoSupportsCapacityScaling) {     
        capacityElement.style.display = "none";
        capacityModifyElement.style.display = "";
        capacityModifyElement.value = "";
        capacityModifyElement.setAttribute("placeholder", capacityElement.innerHTML);
    }
    else {
        capacityModifyElement.style.display = "none";
        capacityElement.style.display = "";
        capacityElement.style.color = "grey";
    }

    var algoSupportsVoltageScaling = GetAlgoBoolField(selectedAlgoProfile, "AlgoSupportsVoltageScaling");
    if (algoSupportsVoltageScaling) {
        voltageElement.style.display = "none";
        voltageModifyElement.style.display = "";
        voltageModifyElement.value = "";
        voltageModifyElement.setAttribute("placeholder", voltageElement.innerHTML);
    }
    else {
        voltageModifyElement.style.display = "none";
        voltageElement.style.display = "";
        voltageElement.style.color = "grey";
    }
}

// ****************************************************************************
function GetAlgoBoolField(algoProfile, fieldName) 
{
    return RunAlgoMetadataLookup(algoProfile, fieldName);    
}

/*
 *  Added for SSP-9637: Write/Read select charger configuration settings
*/
function CancelModifyMode() {
    document.getElementById("modifyButton").style.display = "";
    document.getElementById("submitAndCancelButton").style.visibility = "hidden";

    for (var i = 0; i < tagValues.length; i++) {
        var element = document.getElementById(tagValues[i]["Tag"]);
        var modifyElement = document.getElementById(tagValues[i]["Tag"] + "_modify");

        element.style.display = "";
        element.style.color = "black";

        if (modifyElement != undefined) {
            modifyElement.style.display = "none";
        }

        var clearElement = document.getElementById(tagValues[i]["Tag"] + "_clear");
        if (clearElement != undefined) {
            clearElement.style.display = "none";
        }
    }
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************

/*
 * Added for SSP-9647: Add range check when modifying target voltage and battery capacity
 * This function makes sure that when we modify the battery capacity, the input number is in 
 * valid range.  
*/
function VerifyBatteryCapacityRange(int) {
    if (int == "" || int == undefined)
        return undefined;

    var dqtModel = dsIdToValueMap["1"];

    var split = dqtModel.split(/[.\-_]/); //Split model by characters . - or _ 
    if (split.length < 2) {
        throw "Invalid model number found in device, could not verify battery capacity range.";
    }

    var serialNum = split[0];
    var modelNum = split[1];
    var jsonIdentifier = serialNum + "-" + modelNum; //Value to find in ChargersData.txt

    /*
    var shell = new ActiveXObject("Scripting.FileSystemObject");
    var documentPath = unescape(document.location);
    var path = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name
    var batteryCapRangeFile = shell.OpenTextFile(path + '\\Support\\ChargersData.txt');

    var json = JSON.parse(batteryCapRangeFile.ReadAll());

    if (json[jsonIdentifier] == undefined) {
        throw "Unrecognized device model, unable to modify battery capacity. Please seek support from Delta-Q.";
    }

    var minBatteryCap = json[jsonIdentifier]["minBatteryCap"];
    var maxBatteryCap = json[jsonIdentifier]["maxBatteryCap"];
    */
    
    var minBatteryCap = RunChargerModelMetadataLookup(jsonIdentifier,"minBattCap");
    var maxBatteryCap = RunChargerModelMetadataLookup(jsonIdentifier,"maxBattCap");
    
    if (parseInt(int) >= minBatteryCap && parseInt(int) <= maxBatteryCap) {
        return int;
    }
    else {
        throw "Battery capacity out of range! Valid range: " + minBatteryCap + "-" + maxBatteryCap;
    }
}

// ****************************************************************************
/*
 * Added for SSP-9647: Add range check when modifying target voltage and battery capacity
 * 
 * This function makes sure that when we modify the target voltage, the input number is in 
 * valid range.  
*/
function VerifyTargetVoltageRange(int) {
    if (int == "" || int == undefined)
        return undefined;

    var dqtModel = dsIdToValueMap["1"];

    var split = dqtModel.split(/[.\-_]/); //Split model by characters . - or _ 
    if (split.length < 2) {
        throw "Invalid model found in device, could not verify battery capacity range.";
    }


    var serialNum = split[0];
    var modelNum = split[1];
    var jsonIdentifier = serialNum + "-" + modelNum; //Value to find in ChargersData.txt

    /*
    var shell = new ActiveXObject("Scripting.FileSystemObject");
    var documentPath = unescape(document.location);
    var path = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name
    var batteryCapRangeFile = shell.OpenTextFile(path + '\\Support\\ChargersData.txt');

    var json = JSON.parse(batteryCapRangeFile.ReadAll());

    if (json[jsonIdentifier] == undefined) {
        throw "Unrecognized device model, unable to modify target voltage. Please seek support from Delta-Q.";
    }

    var minVoltage = json[jsonIdentifier]["minVoltage"];
    var maxVoltage = json[jsonIdentifier]["maxVoltage"];
    */
    
    var minVoltage = RunChargerModelMetadataLookup(jsonIdentifier,"minVolt");
    var maxVoltage = RunChargerModelMetadataLookup(jsonIdentifier,"maxVolt");
    
    
    if (parseInt(int) >= minVoltage && parseInt(int) <= maxVoltage) {
        return int;
    }
    else {
        throw "Target voltage out of range! Valid range: " + minVoltage + "-" + maxVoltage;
    }
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************

//Source: https://www.cirris.com/learning-center/calculators/133-wire-resistance-calculator-table
// Resistance is in ohms per 100 feet
// for 0 to 40 gauge wire
var WireResistance = new Array(41);

/*
 * Added for SSP-9648
*/
WireResistance[0] = 0.009827;
WireResistance[1] = 0.01239;
WireResistance[2] = 0.01563;
WireResistance[3] = 0.01970;
WireResistance[4] = 0.02485;
WireResistance[5] = 0.03133;
WireResistance[6] = 0.03951;
WireResistance[7] = 0.04982;
WireResistance[8] = 0.06282;
WireResistance[9] = 0.07921;
WireResistance[10] = 0.09989;
WireResistance[11] = 0.1260;
WireResistance[12] = 0.1588;
WireResistance[13] = 0.2003;
WireResistance[14] = 0.2525;
WireResistance[15] = 0.3184;
WireResistance[16] = 0.4016;
WireResistance[17] = 0.5064;
WireResistance[18] = 0.6385;
WireResistance[19] = 0.8051;
WireResistance[20] = 1.015;
WireResistance[21] = 1.280;
WireResistance[22] = 1.614;
WireResistance[23] = 2.036;
WireResistance[24] = 2.567;
WireResistance[25] = 3.237;
WireResistance[26] = 4.081;
WireResistance[27] = 5.147;
WireResistance[28] = 6.490;
WireResistance[29] = 8.183;
WireResistance[30] = 10.32;
WireResistance[31] = 13.01;
WireResistance[32] = 16.41;
WireResistance[33] = 20.69;
WireResistance[34] = 26.09;
WireResistance[35] = 32.90;
WireResistance[36] = 41.48;
WireResistance[37] = 52.31;
WireResistance[38] = 65.96;
WireResistance[39] = 83.18;
WireResistance[40] = 104.90;

/*
 * Added for SSP-9648: Charger summary, Add ability to set Cable resistance correction
*/
function ComputeWireResistance(WireGauge, WireLength, connectorResistance, Units) {
    if (isNaN(WireGauge) || WireGauge > 40 || WireGauge < 0) {
        alert("Invalid Wire gauge. Valid Range: 0 - 40");
        return 0;
    }

    if (isNaN(WireLength) || WireLength < 0) {
        alert("Invalid Wire length");
        return 0;
    }

    if (isNaN(connectorResistance)) {
        connectorResistance = 0;
    }

    var res;

    WireLength = WireLength * 2; // We need to double length to account for return path

    res = -1.0;

    if (Units == 'Feet') {
        // ohms per foot
        res = WireLength * WireResistance[WireGauge] / 100.0;
    }
    else if (Units == 'Inches') {
        // ohms per inch
        res = ((WireLength / 12.0) * WireResistance[WireGauge]) / 100.0;
    }
    else {
        // ohms per meter
        res = WireLength * WireResistance[WireGauge] / 30.48;
    }
    res = Math.round(res * 1000);

    return res + connectorResistance;
}

//**************************************************************************************************************************************************************
//**********************************************************************Tabs************************************************************************************
//**************************************************************************************************************************************************************

function SummaryButtonPressed() {
    CloseUpperTabs();

    document.getElementById("summaryButton").className += " active";

    document.getElementById("SummarySection").style.display = "block";
}

// ****************************************************************************
function ProgramButtonPressed() {
    CloseUpperTabs();

    document.getElementById("programButton").className += " active";

    document.getElementById("ProgrammingSection").style.display = "block";
    //document.getElementById("programSecurityKey").style.display = "none";
    //document.getElementById("externalDeviceKey").style.display = "none";
}

function DownloadLogButtonPressed() {
    CloseUpperTabs();

    document.getElementById("downloadLogButton").className += " active";

    document.getElementById("LogDownloadSection").style.display = "block";
}

// ****************************************************************************
function CloseUpperTabs() {
    var tabButtons = document.getElementsByClassName("tabButton");
    for (i = 0; i < tabButtons.length; i++) {
        tabButtons[i].className = tabButtons[i].className.replace(" active", "");
    }
    document.getElementById("SummarySection").style.display = "none";
    document.getElementById("ProgrammingSection").style.display = "none";
    document.getElementById("LogDownloadSection").style.display = "none";
}

//**************************************************************************************************************************************************************
//*******************************************************************PROGRAMMING********************************************************************************
//**************************************************************************************************************************************************************

function OnProgramFileChanged() 
{
	document.getElementById('crcFileLocation').value = "";
	document.getElementById('crcFileIndicator').setAttribute("src", "");
	
	document.getElementById('mmfileLocation').value = "";
	document.getElementById('mmfIndicator').setAttribute("src", "");
	
	
    var programFilePath = document.getElementById('programFileLocation').value;
    var programFile = null;
    if ( programFilePath.toLowerCase().slice(-4) == ".zip" )
    {
        try
        {
            var unzippedProgramFilePath = window.external.UnzipFileIntoBINAndCRC(programFilePath);
            document.getElementById('programFileLocation').value = unzippedProgramFilePath;            
            var hexStr = window.external.LoadFileAsBase64Str(unzippedProgramFilePath);
            
            var binary_string = window.atob(hexStr);
            var len = binary_string.length;
            var unzipBytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) 
            {
                unzipBytes[i] = binary_string.charCodeAt(i);
            }
            
            programFile = new Blob([unzipBytes]);
            
            programFilePath = document.getElementById('programFileLocation').value;
            
        } catch (err )
        {
        }
    } else if (document.getElementById('programFileSelect').files[0] != null) 
    {
        if ( document.getElementById('programFileSelect').files[0].name.toLowerCase() ==
             programFilePath.toLowerCase().slice(-1 * document.getElementById('programFileSelect').files[0].name.length) )
        {
            programFile = document.getElementById('programFileSelect').files[0];
        } else {
            // the file is not what's in the file location.  Load the one from the file location instead
            
            var hexStr = window.external.LoadFileAsBase64Str(document.getElementById('programFileLocation').value);
            
            var binary_string = window.atob(hexStr);
            var len = binary_string.length;
            var unzipBytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) 
            {
                unzipBytes[i] = binary_string.charCodeAt(i);
            }
            
            programFile = new Blob([unzipBytes]);
            
        }
        
    }
    
    

    var programFileIndicatorMessage = document.getElementById('programFileIndicatorMessage');
    var programFileIndicator = document.getElementById('programFileIndicator');

    if (programFile == null || programFile == undefined) {
        programFileIndicator.setAttribute("src", "");
        programFileIndicatorMessage.setAttribute("title", "");
        programStartButton.disabled = true;
        return;
    }

    GetBaudRateNodeIdFromCO_CAN( programFile );
	
    VerifySoftwareFile(programFile, OnError, OnSuccess)

    
	function OnSuccess(successMessage) {
        programFileIndicator.setAttribute("src", "Support/Good.svg");
        programFileIndicatorMessage.setAttribute("title", successMessage);
        programStartButton.disabled = false;
    }

    function OnError(errorMsg) {
        programFileIndicator.setAttribute("src", "Support/Warning.svg");
        programFileIndicatorMessage.setAttribute("title", errorMsg);
        programStartButton.disabled = true;
    }
    
    var path = programFilePath.substring(0, programFilePath.lastIndexOf('\\') + 1); //chop off file name
	
    //Attempt to find Crc file
	
	{		
		var shell = new ActiveXObject("Scripting.FileSystemObject");

		if (shell.FileExists(path + "crc_s.txt") &&
			programFilePath.length > "pre_co_config.bin".length &&
			programFilePath.toLowerCase().substring( programFilePath.length - "pre_co_config.bin".length) != "pre_co_config.bin" ) 
		{
			var crcFileLocationElement = document.getElementById('crcFileLocation');

			crcFileLocationElement.value = path + "crc_s.txt";
			OnCrcFileChanged();
		}		
	}
    
	// Atempt to find the MMF file
	if ( programFilePath.length > "pre_co_config.bin".length &&
		 programFilePath.toLowerCase().substring( programFilePath.length - "pre_co_config.bin".length) != "pre_co_config.bin" )
	{
		var shell = new ActiveXObject("Scripting.FileSystemObject");

		if (shell.FileExists(path + "..\\..\\..\\..\\New_MMF.txt")) 
		{
			var mmFileLocationElement = document.getElementById('mmfileLocation');

			mmFileLocationElement.value = path + "..\\..\\..\\..\\New_MMF.txt";			
			
			OnMMFileChanged();
		} else if (shell.FileExists(path + "..\\..\\..\\New_MMF.txt"))
		{
			var mmFileLocationElement = document.getElementById('mmfileLocation');

			mmFileLocationElement.value = path + "..\\..\\..\\New_MMF.txt";			
			
			OnMMFileChanged();
		} else if (shell.FileExists(path + "..\\..\\New_MMF.txt"))
		{
			var mmFileLocationElement = document.getElementById('mmfileLocation');

			mmFileLocationElement.value = path + "..\\..\\New_MMF.txt";			
			
			OnMMFileChanged();
		} else if (shell.FileExists(path + "..\\New_MMF.txt"))
		{
			var mmFileLocationElement = document.getElementById('mmfileLocation');

			mmFileLocationElement.value = path + "..\\New_MMF.txt";			
			
			OnMMFileChanged();
		} else if (shell.FileExists(path + "New_MMF.txt"))
		{
			var mmFileLocationElement = document.getElementById('mmfileLocation');

			mmFileLocationElement.value = path + "New_MMF.txt";			
			
			OnMMFileChanged();
		}
	}
	
}

// ****************************************************************************
function OnCrcFileChanged() {

    var crcFilePath = document.getElementById('crcFileLocation').value;

    var crcFileIndicatorMessage = document.getElementById('crcFileIndicatorMessage');
    var crcFileIndicator = document.getElementById('crcFileIndicator');
    var crcFileClearButton = document.getElementById("crcClearButton");

    if (crcFilePath == "") {
        crcFileIndicator.setAttribute("src", "");
        crcFileIndicatorMessage.setAttribute("title", "");
        crcFileClearButton.style.display = "none";
        return;
    }

    VerifyCRCFile(crcFilePath, OnError, OnSuccess);

    function OnSuccess(successMessage) {
        crcFileIndicator.setAttribute("src", "Support/Good.svg");
        crcFileIndicatorMessage.setAttribute("title", successMessage);
        crcFileClearButton.style.display = "inline-block";
    }

    function OnError(errorMsg) {
        crcFileIndicator.setAttribute("src", "Support/Warning.svg");
        crcFileIndicatorMessage.setAttribute("title", errorMsg);
        crcFileClearButton.style.display = "inline-block";
    }
}

// ****************************************************************************
function OnMMFileChanged() 
{

    var mmFilePath = document.getElementById('mmfileLocation').value;

    var mmFileIndicatorMessage = document.getElementById('mmfIndicatorMessage');
    var mmFileIndicator = document.getElementById('mmfIndicator');
    var mmfClearButton = document.getElementById("mmfClearButton");

    if (mmFilePath == "") 
	{
        mmFileIndicator.setAttribute("src", "");
        mmFileIndicatorMessage.setAttribute("title", "");
        mmfClearButton.style.display = "none";
        return;
    }
	
	VerifyMMFile(mmFilePath, OnError, OnSuccess);
	
	function OnSuccess(successMessage) {
        mmfIndicator.setAttribute("src", "Support/Good.svg");
        mmfIndicatorMessage.setAttribute("title", successMessage);
        mmfClearButton.style.display = "inline-block";
    }

    function OnError(errorMsg) {
        mmfIndicator.setAttribute("src", "Support/Warning.svg");
        mmfIndicatorMessage.setAttribute("title", errorMsg);
        mmfClearButton.style.display = "inline-block";
    }
}

// ****************************************************************************
var toProgramList = [];
var toCRCList = [];
var toMMFList = [];
var totalProgStep = 0;

function ProgramStartButtonPressed() 
{
    document.getElementById("ProgrammingLogText").innerHTML = "";
    document.getElementById("programmingProgress").value = 0;
    document.getElementById("programmingProgress").style.backgroundColor = '';

    DisableButtons(true);
	
	{
		var programFilePath = document.getElementById('programFileLocation').value;
		var path = programFilePath.substring(0, programFilePath.lastIndexOf('\\') + 1); //chop off file name
	
		var shell = new ActiveXObject("Scripting.FileSystemObject");
	
		if (programFilePath.length > "pre_co_config.bin".length &&
			programFilePath.toLowerCase().substring( programFilePath.length - "pre_co_config.bin".length) != "pre_co_config.bin" &&
			shell.FileExists(path + "pre_co_config.bin")) 
		{
			// pre programming detected
			//
			// cache the crc file location first			
			toProgramList = [ path + "pre_co_config.bin", document.getElementById('programFileLocation').value ];
			toCRCList = [ "", document.getElementById('crcFileLocation').value ];
			toMMFList = ["", document.getElementById("mmfileLocation").value ];
			totalProgStep = toProgramList.length;
			// program the preprog
			ProgramFileToChargers();					
		
		}
		else 
		{
			toProgramList = [ document.getElementById('programFileLocation').value ];
			toCRCList = [ document.getElementById('crcFileLocation').value ];
			toMMFList = [ document.getElementById("mmfileLocation").value ];
			totalProgStep = toProgramList.length;
			ProgramFileToChargers();		
		}
	}

    
}

// ****************************************************************************
function VerifyCRCFile(filePath, ErrorCallBack, SuccessCallBack) 
{
    var fileCRC = GetFileCRC(filePath);
    if (fileCRC == "") 
	{
        ErrorCallBack("This must be a .txt file containing CRC information for the file to be programmed. No check will be performed.");
        return;
    }
    SuccessCallBack(" This file will be used to perform a CRC check after programming.");
}

// ****************************************************************************
function VerifyMMFile(filePath, ErrorCallBack, SuccessCallBack) 
{
    var fnvsChkStr = GetFileMMFContent(filePath);
    if (fnvsChkStr == "") 
	{
        ErrorCallBack("This must be a .txt file with fchk(...) or chkEmpty(...).  None is found, so no check will be performed.");
        return;
    }
	
	var fnvsParts = fnvsChkStr.split(",");
	
    SuccessCallBack(" This file will be used to DS Value Chks.  " + fnvsParts.length + " chks found. ");
}

// ****************************************************************************
function GetFileMMFContent(filePath) 
{
	var shell = new ActiveXObject("Scripting.FileSystemObject");
    var mmfContent = shell.OpenTextFile(filePath, 1, false);
    var content = mmfContent.ReadAll();
    var lines = content.split(/\r?\n/);

	var res = "";
	
	for (var i = 0; i < lines.length; i++) 
	{
		var mmfParts = lines[i].split(",");
		for ( var k = 0; k < mmfParts.length; k++ )
		{
			if ( mmfParts[k].indexOf("fnvs(") >= 0 ||
			     mmfParts[k].indexOf("chkEmpty(") >= 0 )
			{
				if ( res == "" )
				{
					res = mmfParts[k];
				} else {
					res = res + "," + mmfParts[k];	
				}
				
			}				
		}        
    }
	
	return res;
}

// ****************************************************************************
function GetFileCRC(filePath) 
{
    var shell = new ActiveXObject("Scripting.FileSystemObject");
    var batchFile = shell.OpenTextFile(filePath, 1, false);
    var content = batchFile.ReadAll();
    var lines = content.split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) 
	{
        if (lines[i].indexOf("overallCRC") > -1) 
		{
            var firstIdx = lines[i].indexOf('(') + 1;
            var endIdx = lines[i].indexOf(')');
            var val = lines[i].substring(firstIdx, endIdx);
			
            if ( val.indexOf(',') <= - 1 )
            {
              return val;
            } else if ( val.indexOf(defAlgoAfterProg) == 0 )
			{
			  return val.split(",")[2];
			}			
        }
    }
    return "";
}

var crc16tab =
    [
        0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
        0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
        0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
        0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
        0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
        0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
        0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
        0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
        0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
        0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
        0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12,
        0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
        0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
        0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
        0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
        0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
        0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
        0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
        0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
        0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
        0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
        0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
        0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
        0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
        0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
        0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
        0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
        0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
        0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
        0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
        0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
        0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0
    ];

// ****************************************************************************    
function GetBaudRateNodeIdFromCO_CAN( file )
{
    defAlgoAfterProg = "";
    var reader = new FileReader();
    reader.onload = function () 
    {
        var arrayBuffer = reader.result,
        array = new Uint8Array(arrayBuffer);
	
        // Find the header for config
        // first start with currIdx
        var currIdx = 0x32;
        var configFound = false;
        var cmdArrayEndIdx = 0;
        var cobsCmdArray = [];
        var nextZeroIdx = 0;
        var decodeCmdArray =[];
        var cmdId = 0;
        var cmdMode = 0;
        
        while ( currIdx < array.length && !configFound )
        {
          if ( array[currIdx + 4] != 0x02)
          {
            payloadSize = (array[currIdx + 0x20 - 1] << 24) + (array[currIdx + 0x20 - 2] << 16) + (array[currIdx + 0x20 - 3] << 8) + (array[currIdx + 0x20 - 4]);
            currIdx = currIdx + array[currIdx] + payloadSize;
          }
          else
          {
            configFound = true;
            
            // Start with the payload
            currIdx = currIdx + array[currIdx];
            
            while ( currIdx < array.length )
            {
              cobsCmdArray = [];
              cmdArrayEndIdx = currIdx;
              while ( cmdArrayEndIdx < array.length && array[cmdArrayEndIdx] != 0x00)
              {
                cobsCmdArray.push( array[cmdArrayEndIdx] );
                cmdArrayEndIdx = cmdArrayEndIdx + 1;
              }
              currIdx = cmdArrayEndIdx;
              
              decodeCmdArray = [];
              nextZeroIdx = 0;
              for (var cobsCmdIdx = 0; cobsCmdIdx < cobsCmdArray.length; cobsCmdIdx++)
              {
                if ( nextZeroIdx == cobsCmdIdx )
                {
                  if ( nextZeroIdx != 0 )
                  {
                    decodeCmdArray.push( 0x00 );
                  }
                  nextZeroIdx = nextZeroIdx + cobsCmdArray[cobsCmdIdx];
                }
                else
                {
                  decodeCmdArray.push( cobsCmdArray[cobsCmdIdx] );
                }
              }
              
              cmdId = (decodeCmdArray[3] << 8)  + (decodeCmdArray[2]);
              cmdMode = (decodeCmdArray[5] << 8)  + (decodeCmdArray[4]);
              
              if ( cmdId == 27 )
              {
                defAlgoAfterProg = "A_" + 
                                   decodeCmdArray[8] + "_" + 
                                   decodeCmdArray[9] + "_" +
                                   ((decodeCmdArray[7] << 8) + (decodeCmdArray[6])) + "_" +
                                   ((decodeCmdArray[11] << 8) + (decodeCmdArray[10]));
                                   
              } else if ( cmdId == 151 )
              {
                nodeIdAfterProg = 10;
                // nodeId
                if ( cmdMode == 1 ) // write
                {
                  var data = new Uint8Array(4);
                  data[0] = decodeCmdArray[6];
                  data[1] = decodeCmdArray[7];
                  data[2] = decodeCmdArray[8];
                  data[3] = decodeCmdArray[9];
                  var f32 = new Float32Array( data.buffer );
                  nodeIdAfterProg = f32[0];
              
                } else if ( cmdMode == 2 ) // erase
                {
                  // probably 10
                }
              } else if ( cmdId == 156 )
              {
                // baudRate
                baudRateAfterProg = 125;
                
                if ( cmdMode == 1 ) // write
                {
                  var data = new Uint8Array(4);
                  data[0] = decodeCmdArray[6];
                  data[1] = decodeCmdArray[7];
                  data[2] = decodeCmdArray[8];
                  data[3] = decodeCmdArray[9];
                  var f32 = new Float32Array( data.buffer );
                  baudRateAfterProg = f32[0];
                      
                } else if ( cmdMode == 2 ) // erase
                {
                  // probably 125kb/s
                }
              } else if ( cmdId == 0xfffe )
              {
                // base config
                // COBS Decode the following decodeCmdArray
                
                baseConfigDecodedContent = [];
                nextZeroIdx = 6;
                for (var cobsCmdIdx = 6; cobsCmdIdx < decodeCmdArray.length; cobsCmdIdx++)
                {
                  if ( nextZeroIdx == cobsCmdIdx )
                  {
                    if ( nextZeroIdx != 6 )
                    {
                      baseConfigDecodedContent.push( 0x00 );
                    }
                    nextZeroIdx = nextZeroIdx + decodeCmdArray[cobsCmdIdx];
                  } else
                  {
                    baseConfigDecodedContent.push( decodeCmdArray[cobsCmdIdx] );
                  }
                }	  
                
                // now, starting from 50, we need to decode the baseConfigDecodedContent
                // that's the actual content of the baseConfig Cmds
                //
                baseConfigCmdContent = [];
                nextZeroIdx = 50;
                for (var cobsCmdIdx = 50; cobsCmdIdx < baseConfigDecodedContent.length; cobsCmdIdx++)
                {
                  if ( nextZeroIdx == cobsCmdIdx )
                  {
                    if ( nextZeroIdx != 50 )
                    {
                      baseConfigCmdContent.push( 0x00 );
                    }
                    nextZeroIdx = nextZeroIdx + baseConfigDecodedContent[cobsCmdIdx];
                  } else
                  {
                    baseConfigCmdContent.push( baseConfigDecodedContent[cobsCmdIdx] );
                  }
                }	  
                
                var currBaseConfigIdx = 0;
                var thisBaseCmdArrayEndIdx = 0;
                while ( currBaseConfigIdx < baseConfigCmdContent.length )
                {
                  thisBaseConfigCOBSCmdArray = [];
                  thisBaseCmdArrayEndIdx = currBaseConfigIdx;
                  while ( thisBaseCmdArrayEndIdx < baseConfigCmdContent.length && baseConfigCmdContent[thisBaseCmdArrayEndIdx] != 0x00)
                  {
                    thisBaseConfigCOBSCmdArray.push( baseConfigCmdContent[thisBaseCmdArrayEndIdx] );
                    thisBaseCmdArrayEndIdx = thisBaseCmdArrayEndIdx + 1;
                  }
                  currBaseConfigIdx = thisBaseCmdArrayEndIdx;
                  
                  // now, thisBaseConfigCOBSCmdArray gets COBS Decoded
                  var decodeBaseCmdArray = [];
                  nextZeroIdx = 0;
                  for (var cobsCmdIdx = 0; cobsCmdIdx < thisBaseConfigCOBSCmdArray.length; cobsCmdIdx++)
                  {
                    if ( nextZeroIdx == cobsCmdIdx )
                    {
                      if ( nextZeroIdx != 0 )
                      {
                        decodeBaseCmdArray.push( 0x00 );
                      }
                      nextZeroIdx = nextZeroIdx + thisBaseConfigCOBSCmdArray[cobsCmdIdx];
                    }
                    else
                    {
                      decodeBaseCmdArray.push( thisBaseConfigCOBSCmdArray[cobsCmdIdx] );
                    }
                  }  
                  
                  baseCmdId = (decodeBaseCmdArray[1] << 8)  + (decodeBaseCmdArray[0]);
                
                  if ( baseCmdId == 151 )
                  {
                    var data = new Uint8Array(4);
                    data[0] = decodeBaseCmdArray[4];
                    data[1] = decodeBaseCmdArray[5];
                    data[2] = decodeBaseCmdArray[6];
                    data[3] = decodeBaseCmdArray[7];
                    var f32 = new Float32Array( data.buffer );
                    nodeIdAfterProg = f32[0];
                    
                  } else if ( baseCmdId == 156 )
                  {
                    var data = new Uint8Array(4);
                    data[0] = decodeBaseCmdArray[4];
                    data[1] = decodeBaseCmdArray[5];
                    data[2] = decodeBaseCmdArray[6];
                    data[3] = decodeBaseCmdArray[7];
                    var f32 = new Float32Array( data.buffer );
                    baudRateAfterProg = f32[0];
                    
                  } else if ( baseCmdId == 27 )
                  {
                      baseCmdId = baseCmdId;
                  }
                    
                  currBaseConfigIdx = currBaseConfigIdx + 1;
                }
              }
                      
              currIdx = cmdArrayEndIdx + 1;
            }	    
          }
        }		
    }
    reader.readAsArrayBuffer(file);
    
}

// ****************************************************************************    
function VerifySoftwareFile(file, ErrorCallBack, SuccessCallBack) 
{

    {
        var reader = new FileReader();
        reader.onload = function () 
        {
            //CRC check file
            var arrayBuffer = reader.result,
                array = new Uint8Array(arrayBuffer);

            var headerSize = array[0];

            if (headerSize == 0) {
                ErrorCallBack("CRC check failed");
                return;
            }

            var containerType = array[4] + array[3];

            // As stated in the document
            var BINARY_CONTAINER_TYPE_PACKAGE = 4;

            if (containerType == BINARY_CONTAINER_TYPE_PACKAGE) 
            {
                var fileCRC = parseInt(PadWithZeros(array[headerSize - 1].toString(16)) + PadWithZeros(array[headerSize - 2].toString(16)), 16)

                // The last two bits are specified in the document to be 0xFF in order to calculate CRC
                var headerBuffer = arrayBuffer.slice(0, headerSize);
                var headerArray = new Uint8Array(headerBuffer);
                headerArray[headerSize - 2] = 0xFF;
                headerArray[headerSize - 1] = 0xFF;

                var calculatedCRC = crc16_ccitt_table(headerArray, headerSize);
                if (fileCRC != calculatedCRC) 
                {
                    ErrorCallBack("CRC check failed");
                    return;
                }

                function PadWithZeros(string) 
                {
                    while (string.length < 2)
                        string = "0" + string;

                    return string;
                }

                VerifyHWCompatibility(array);
            }
            else {
                ErrorCallBack("CRC check failed");
                return;
            }
        }
        reader.readAsArrayBuffer(file);
    }

    function VerifyHWCompatibility(array) 
	{
		otherNodeIdToChangeBaudRate = [];
		
        {
            //Retrieve bin file HW info
            {
                
                var headerSize = array[0];

                var hwVariantBin = array[headerSize + 6];

                var maxHwMajorVersionBin = array[headerSize + 32];
                var minHwMajorVersionBin = array[headerSize + 34];
                var minHwMinorVersionBin = array[headerSize + 35];

                var nodeIdsToCheck = [];
                nodeIdsToCheck.push(selectedCharger["nodeId"]);
                selectedCharger["secondaryChargers"].forEach(
                function (secondaryNodeId) 
                {
                    nodeIdsToCheck.push(secondaryNodeId);
                })
            }

            //Check HW Compatibilty, (Loop for each device)
            for (var i = 0; i < nodeIdsToCheck.length; i++) 
            {
                //Retrieve device HW info
                var hwVariantCharger;
                var hwMajorVersionCharger;
                var hwMinorVersionCharger;
                var hwVerKnown = true;
                {
                    var bCrcCheck = CrcCheckCharger(nodeIdsToCheck[i]);
                    if (!bCrcCheck) 
                    {
                        ErrorCallBack("No connection to device.");
                        return;
                    }

                    var returnLines = RunCO_PCAN_Demo_WithOverlay("-mode 4"
							+ " -br " + baudRate
							+ " -tout " + "1"
							+ " -nodeId " + nodeIdsToCheck[i]
							+ " -programmer_COBId " + selectedCharger["programmerCobId"]
							+ " -charger_COBId " + selectedCharger["chargerCobId"]
							+ " -channel " + selectedCharger["channel"]
							+ " -dsId 3",
							"Retrieving HW info");

                    var returnBytes = GetBytesArrayFromReturnLines(returnLines);
                        
                    if (returnBytes == null)
                    {
                        hwVerKnown = false;
                    } else if (returnBytes != null && returnBytes.length >= 4) 
                    {
                        var hwVariantCharger = parseInt(returnBytes[0], 16);
                        var hwMajorVersionCharger = parseInt(returnBytes[2], 16);
                        var hwMinorVersionCharger = parseInt(returnBytes[3], 16);
                    }
                    else 
                    {
                        ErrorCallBack("Invalid hardware version.");
                        return;
                    }
                }

                //Compare versions and variants
                if ( hwVerKnown )
                {
                    //Compare device & bin file hardware variant
                    //Logic: If .bin file HW variant == device HW variant - OK
                    if (hwVariantCharger != hwVariantBin) 
                    {
                        ErrorCallBack("Error> Bin hardware variant does not match device hardware variant.");
                        return;
                    }
                    
                    // locked in a loadedHWVar from previously
                    // loaded CO_Config.bin
                    //
                    loadedHWVar = hwVariantBin;

                    //Compare versions
                    //Logic: If .bin file max major HW version >=  device HW major version  - OK
                    if (hwMajorVersionCharger > maxHwMajorVersionBin) 
                    {
                        ErrorCallBack("Device does not support bin file hardware version.\n" +
                                      "Bin file supports maximum hardware version up to: " + maxHwMajorVersionBin + "\n" +
                                      "Device hardware version: " + hwMajorVersionCharger + ".");
                        return;
                    }
                    //Compare versions
                    //Logic: If .bin file min HW version <= device HW version - OK
                    if ((hwMajorVersionCharger < minHwMajorVersionBin) ||
                        (minHwMajorVersionBin == hwMajorVersionCharger &&
                            hwMinorVersionCharger < minHwMinorVersionBin)) 
                    {
                        ErrorCallBack("Device does not support bin file hardware version.\n" +
                                      "Bin file supports minimum hardware version of: " + minHwMajorVersionBin + "." + minHwMinorVersionBin + "\n" +
                                      "Device hardware version: " + hwMajorVersionCharger + "." + hwMinorVersionCharger + "\n");
                        return;
                    }
                }
            }

            var detectedDevices = GetDevices([baudRate], selectedCharger["channel"], selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], false);
            var devicesList = detectedDevices["list"];
            for ( var deviceIdx = 0; deviceIdx < devicesList.length; deviceIdx++ )
            {
                if ( devicesList[deviceIdx]["nodeId"] != selectedCharger["nodeId"] &&
                     devicesList[deviceIdx]["nodeId"] == nodeIdAfterProg )
                {
                    ErrorCallBack("Specified BIN File sets nodeId to " + nodeIdAfterProg + ",\n" +
                                  "and it will conflict with another device's nodeId in the CAN Network.\n");
                    return;
                }
            }
            
            if ( baudRateAfterProg != "" &&
                 baudRate != baudRateAfterProg )
            {
                for ( var deviceIdx = 0; deviceIdx < devicesList.length; deviceIdx++ )
                {
                  if ( devicesList[deviceIdx]["nodeId"] != selectedCharger["nodeId"] )
                  {
                    otherNodeIdToChangeBaudRate.push( devicesList[deviceIdx]["nodeId"] );
                  }
                }
            }
            
            var newBaudRateChangeMsg = "";
            if ( otherNodeIdToChangeBaudRate.length > 0 )
            {
                newBaudRateChangeMsg = "\nDevices with these nodeIds will have their baud rate changed: ";
                for ( var deviceIdx = 0; deviceIdx < otherNodeIdToChangeBaudRate.length; deviceIdx++ )
                {
                  if ( deviceIdx < otherNodeIdToChangeBaudRate.length - 1 )
                  {
                    newBaudRateChangeMsg = newBaudRateChangeMsg + otherNodeIdToChangeBaudRate[deviceIdx] + ",";
                  } else {
                    newBaudRateChangeMsg = newBaudRateChangeMsg + otherNodeIdToChangeBaudRate[deviceIdx];
                  }
                }
            }

            var defAlgoAfterProgMsg = "";
            if ( defAlgoAfterProg != "" )
            {
                defAlgoAfterProgMsg = "DefAlgo will be " + defAlgoAfterProg + "\n";
            }

            SuccessCallBack("File verified and ready.\n" + 
                            "Configuring Node Id/Baud Rate to " + nodeIdAfterProg + "/" + baudRateAfterProg + "\n" +
                            defAlgoAfterProgMsg +
                            newBaudRateChangeMsg);
        }
	
    }

    function crc16_ccitt_table(pBuffer, len) {

        var bufIdx = 0;

        var data8;
        var data16;
        var crc = 0;

        while (bufIdx < len) {
            data8 = pBuffer[bufIdx] >>> 0;
            data16 = data8 >>> 0;

            //always end bit wise ops with >>> 0 so the result gets interpreted as unsigned.
            var calc1 = (crc << 8) >>> 0;

            var calc2 = (crc >>> 8) >>> 0;
            var calc3 = (calc2 ^ data16) >>> 0;
            var calc4 = (calc3 & 0x00FF) >>> 0;
            var calc5 = crc16tab[calc4] >>> 0;

            var calc6 = (calc1 ^ calc5) >>> 0;
            var calc7 = (calc6 & 0xFFFF) >>> 0;

            crc = calc7;
            bufIdx++;
        }
        return crc;
    }
}

// ****************************************************************************
function PauseInLoop(waitMSec)
{
    var targetDate = Date.now() + waitMSec;
    while (Date.now() < targetDate) {};
    return;
}

// ****************************************************************************
function ProgramFileToChargers() 
{
    /*
    var programmingSecurityKeyOption = document.getElementById("programmingSecuritySelect").value;
    var programmingSecurityKey = document.getElementById("programSecurityKey").value;

    var externalDeviceAuthOption = document.getElementById("externalDeviceAuthSelect").value;
    var externalDeviceAuthKey = document.getElementById("externalDeviceKey").value;
    */
	
	// first thing, if the other nodeIds need to have the baudrate changed to after prog, do so.
	//
	var resetNodeIdStr = "";
	if ( baudRate != baudRateAfterProg )
	{
		for (var deviceIdx = 0; deviceIdx < otherNodeIdToChangeBaudRate.length; deviceIdx++)
		{
			AddTextToProgrammingLog(GetTextLogHeader("Modifying Baud Rate to " + baudRateAfterProg + " for NodeId " + otherNodeIdToChangeBaudRate[deviceIdx]));
			
			ModifyDsId(otherNodeIdToChangeBaudRate[deviceIdx], "156", TextToBytes(baudRateAfterProg, "float32_big_endian"));
			
			if (resetNodeIdStr == "")
            {
                resetNodeIdStr = otherNodeIdToChangeBaudRate[deviceIdx];
            }
            else
            {
                resetNodeIdStr = resetNodeIdStr + "," + otherNodeIdToChangeBaudRate[deviceIdx];
            }            
		}
	}
	
    var nodeIdList = [];
    nodeIdList.push(selectedCharger["nodeId"]);
    selectedCharger["secondaryChargers"].forEach(
        function (s) 
        {
            nodeIdList.push(s);
        }
    );

    var callStr =
        (canSecurityKey != "" ?
            "-sec " + canSecurityKey + " " :
            "-noAuth ") +
        (externalDeviceAuth == false ?
            "-skipUnhideParam " :
            (canUnhideKey != "" ?
                "-unhideKey " + canUnhideKey + " " :
                "")
           )
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -br " + baudRate
        + " -tout " + "100"
        + " -channel " + selectedCharger["channel"]

	var programFileLocation = toProgramList.shift();
	var crcFilePath = toCRCList.shift();
	var mmfPath = toMMFList.shift();
											
    if (nodeIdList.length == 1) 
    {
        //Single device programming
        callStr += " -mode 0 ";
        callStr += " -nodeId " + selectedCharger["nodeId"];
        callStr += " -f \"" + programFileLocation + "\" ";
    }
    else {
        //Parallel devices programming

        var nodeIdToPathStr = "";

        nodeIdList.forEach(function (thisNodeId) 
        {
            var thisFileLocation = programFileLocation;
            nodeIdToPathStr += thisNodeId + "|" + thisFileLocation + "|";
        })

        callStr += " -mode 10 ";
        callStr += " -nodeIdAndFile \"" + nodeIdToPathStr + "\"";
    }

    AddTextToProgrammingLog("Call str" + 
							(toProgramList.length == 0 ? "" : " " + toProgramList.length) + 
							": " + callStr);
    AddTextToProgrammingLog(GetTextLogHeader("Programming"));

    var estimatedTime;
    {
        //Get estimated time
        var baseTime = 6.5;
        var factorBase = 1.65;
        var baudRateScale = 1.45;
        var fileSizeScale = 1.75;
        var fileSizeBase = 50000;

        var fileSize = document.getElementById('programFileSelect').files[0].size;

        // Increases as baud rate lowers
        var baudRateFactor = Math.pow(factorBase, Math.sqrt(1000.0 / baudRate)) * baudRateScale;
        var fileSizeFactor = (((fileSize * fileSizeScale) - fileSizeBase) / fileSizeBase) * baudRateFactor;
        var baseTimeFactor = baseTime;

        var time = baseTimeFactor + fileSizeFactor;

        var fudgeFactor = 1.1;

        estimatedTime = time * fudgeFactor;

        estimatedTime = estimatedTime * nodeIdList.length;
        if (estimatedTime == 0) {
            estimatedTime = 100;
        }

        estimatedTime = estimatedTime.toFixed(2); //Round off decimals
    } 

    startTime = new Date();
    var progressBarTimer = setInterval(ProgramProgressBarTimer, 1000, startTime, estimatedTime);

    AddTextToProgrammingLog("Estimated time: " + estimatedTime + "s");
    AddTextToProgrammingLog(GetTextLogHeader("Programming file to device: " + GetSerialNumber(selectedCharger["nodeId"]) + ", " + startTime));

    var sessResPath = Start_Batch_Call('CO_PCAN_Demo.exe', callStr, false);

    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, false);

    var bSuccess = "undecided";

    var readOutputFile = setInterval(function () 
	{
        try 
		{
            if ( bSuccess != "undecided" )
            {
                clearInterval(progressBarTimer);
                clearInterval(readOutputFile);
                if ( document.getElementById("programmingProgress").style.backgroundColor != 'red' )
                {
                    document.getElementById("programmingProgress").value = 100;    
                }
                
                    
            } else if ( !flog.AtEndOfStream )
            {
                var line = flog.ReadLine();

                if (line.indexOf("Failed") != -1) 
                {
                    AddTextToProgrammingLog("<red>" + line + "</red>");
                }
                else {
                    AddTextToProgrammingLog(line);
                }

                if (line.indexOf("Program End --") != -1) 
                {
                    bSuccess = "true";
                    
                    flog.Close();
                    clearInterval(progressBarTimer);
                    clearInterval(readOutputFile);
                    fso.DeleteFile(sessResPath);
                    
                    if (line.indexOf("Failed") != -1) 
                    {
                        bSuccess = "false";
                        document.getElementById("programmingProgress").style.backgroundColor = 'red';                        
                    }
                    else 
                    {
                        bSuccess = "true";
                        document.getElementById("programmingProgress").style.backgroundColor = '';
                        document.getElementById("programmingProgress").value = ((totalProgStep - toProgramList.length - 1) / totalProgStep * 100) + (0.9 * 100 / totalProgStep);
                        
                    }

                    if (bSuccess == "true") 
                    {
                        // after, if the other nodeIds need to have the baudrate changed to after prog, reset them.
                        //
                        if ( baudRate != baudRateAfterProg && resetNodeIdStr != "" )
                        {
                            AddTextToProgrammingLog(GetTextLogHeader("Resetting Device NodeId " + resetNodeIdStr));

                            RunCO_PCAN_Demo_WithOverlay("-mode 102" + 
                                                        " -br " + baudRate + 
                                                        " -tout 1" +
                                                        " -nodeIdArray " + resetNodeIdStr +
                                                        " -programmer_COBId " + selectedCharger["programmerCobId"] +
                                                        " -charger_COBId " + selectedCharger["chargerCobId"] +
                                                        " -channel " + selectedCharger["channel"], 
                                                        "Reset Chargers...");        
                        }
        
                        AddTextToProgrammingLog(GetTextLogHeader("Waiting for programming to complete..."));
						
						var detectAttempts = 5;
						
						var detectWakeUpAndChkCRCCall = setTimeout( DetectWakeUpAndChkCRC, 20000 );
						
						/////////////////////////////////////////////////////////////////////////////
						function DetectWakeUpAndChkCRC()
						{
							detectedDevices = GetDevices([baudRateAfterProg,"125","250","500","1000"], 
														 selectedCharger["channel"], 
														 selectedCharger["programmerCobId"], 
														 selectedCharger["chargerCobId"], 
														 false);
														 
							detectAttempts = detectAttempts - 1;
							
							if ( detectedDevices["list"].length == 0 )
							{
								if ( detectAttempts <= 0 )
								{						
									AddTextToProgrammingLog(GetTextLogHeader("<red>ERROR: LOST CONNECTION AFTER PROGRAMMING!</red>"));                        
								} else {
									setTimeout( DetectWakeUpAndChkCRC, 1000 );
								}
								
							} else 
							{
																	
								AddTextToProgrammingLog(GetTextLogHeader("CRC Check..."));
								var befProgNodeId = selectedCharger["nodeId"];
								var devicesList = detectedDevices["list"];
								baudRate = detectedDevices["br"];
								if ( devicesList.length == 1 )
								{
									nodeIdAfterProg = devicesList[0]["nodeId"];
									selectedCharger["nodeId"] = devicesList[0]["nodeId"];                                
								} else 
								{
									for ( var deviceIdx = 0; deviceIdx < devicesList.length; deviceIdx++ )
									{
										if ( devicesList[deviceIdx]["nodeId"] == nodeIdAfterProg )
										{
											selectedCharger["nodeId"] = devicesList[deviceIdx]["nodeId"];
										}
									}    
								}
				
								document.title = "Node ID: " + selectedCharger["nodeId"];

								CheckFileAndChargerCRCMatch(crcFilePath, mmfPath, selectedCharger["nodeId"]);
								
								if ( document.getElementById("programmingProgress").style.backgroundColor != 'red' )
								{
									document.getElementById("programmingProgress").value = ((totalProgStep - toProgramList.length - 1) / totalProgStep) * 100 + (0.9 * 100 / totalProgStep);
								}
								
								DisableButtons(false);
					
								if ( toProgramList.length > 0 )
								{
									AddTextToProgrammingLog("");
									
									ProgramFileToChargers();
									
								} else 
								{
													
									// Refresh summary page after programming
									InitializeSummary();												
		
									AddTextToProgrammingLog("Complete.");
									
									document.getElementById("programmingProgress").value = 100;
								}
												
							} // end of having detected devices...
										
						}
                        
												
                    }
                }
            }
            
        }
        catch (error) 
		{
            AddTextToProgrammingLog(error.message);
        }
    }, 50);
        
}


// ****************************************************************************
/// <summary>
/// Checks that the CRC from the CRC file and the device's CRC match.
/// </summary>
function CheckFileAndChargerCRCMatch(crcFilePath, mmfPath, oldNodeId) 
{
    
    if (crcFilePath != "") 
    {
        var fileCRC = GetFileCRC(crcFilePath);

        var thisBaudRate = GetBaudRateFromFile();
        if (thisBaudRate == "") 
        {
            thisBaudRate = baudRate;
        }

        var newNodeId = GetNodeIdFromFile()
        if (newNodeId == "") 
        {
            newNodeId = selectedCharger["nodeId"];
        }

        var chargerCRC = "";
        var actualNodeId = oldNodeId;
        var attempts = 20;
        var chargeCRCParts = null;
        
        while ( attempts > 0 )
        {
            PauseInLoop(3000);
            actualNodeId = oldNodeId;
            chargeCRCParts = GetValueFromCharger(   "8022", "1", "4", oldNodeId, 
                                                    selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], 
                                                    selectedCharger["channel"] );
            if (chargeCRCParts == null) 
            {
                // Try again to get the node id by scanning the file.
                PauseInLoop(3000);
                actualNodeId = newNodeId;
                chargeCRCParts = GetValueFromCharger(   "8022", "1", "4", newNodeId, 
                                                        selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], 
                                                        selectedCharger["channel"]  );
            }
            
            if ( chargeCRCParts == null )
            {
                attempts = attempts - 1;
            } else {
                break;
            }
        }
        
        if (chargeCRCParts != null) 
        {
            chargerCRC = (chargeCRCParts[1] + chargeCRCParts[0]).toUpperCase();
        } else {
            chargerCRC = "";
        }
	
		var paddedFileCRC = fileCRC;
		for ( let pIdx = fileCRC.length; pIdx < 4; pIdx++)
		{
		  paddedFileCRC += "0" + paddedFileCRC;
		}
		

        var bCrcMatch = parseInt("0x" + fileCRC.toLowerCase()) == parseInt("0x" + chargerCRC.toLowerCase());
        AddTextToProgrammingLog("NodeId:\t\t" + actualNodeId);
        AddTextToProgrammingLog("  File CRC:\t" + paddedFileCRC);
        AddTextToProgrammingLog("  Device CRC:\t" + chargerCRC);
        AddTextToProgrammingLog(bCrcMatch ? "CRC Matched." : "<red>CRC Mismatched.</red>");
        if (!bCrcMatch)
        {
          document.getElementById("programmingProgress").style.backgroundColor = 'red';
          document.getElementById("programmingProgress").value = 0;    
        }
        
    }
    else {
        AddTextToProgrammingLog("The CRC check was skipped due to either missing or invalid CRC file provided.");
        AddTextToProgrammingLog("Programming was executed as normal.");
    }
	
	// MMF Check Here
	if (mmfPath != "") 
	{
		ExternalDeviceAuthentication();
		
		var shell = new ActiveXObject("Scripting.FileSystemObject");
		if ( shell.FileExists(mmfPath) )
		{
			var fnvsChkStr = GetFileMMFContent(mmfPath);
			if (fnvsChkStr != "") 
			{
				var dsIdsCallStr = "";
				
				var fnvsChkList = fnvsChkStr.split(",");
				
				var fnvsChkVal = {};
				
				var numOfFails = 0;
				
				for ( var fnvsChkIdx = 0; fnvsChkIdx < fnvsChkList.length; fnvsChkIdx++ )
				{
					if ( fnvsChkList[fnvsChkIdx].indexOf('chkEmpty(') == 0 )
					{
						var firstIdx = fnvsChkList[fnvsChkIdx].indexOf('(') + 1;
						var endIdx = fnvsChkList[fnvsChkIdx].indexOf(')');						
						var val = fnvsChkList[fnvsChkIdx].substring(firstIdx, endIdx);
						
						var returnLines = RunCO_PCAN_Demo_WithOverlay( "-mode 4" + 
																	   " -br " + baudRate +
																	   " -tout " + "2" +
																	   " -nodeId " + selectedCharger["nodeId"] +
																	   " -dsId " + val +
																	   " -programmer_COBId " + selectedCharger["programmerCobId"] +
																	   " -charger_COBId " + selectedCharger["chargerCobId"] +
																	   " -channel " + selectedCharger["channel"],
																	   " Check DS Param Values..");

						var dsIdIndex = -1; //Current index reading from (dsIdsToRetrieve)
						var error;
						var isEmpty = false;

						for (var i = 0; i < returnLines.length; i++) 
						{
							var line = returnLines[i];
							if (line.indexOf("READ DSID") != -1) 
							{	 
								//Look for keywork READ DSID, then the bytes following after this keywork will be the corresponding bytes.
								dsIdIndex++;
								error = "";
							} else if (line.indexOf("EMPTY") != -1) //Override error
							{
								isEmpty = true;
							} else if (error == "" && line.indexOf("ErrorCodeAdditional") != -1) //Override error
							{
								error = "Failed to retrieve value.";
							}
						}
						
						if ( isEmpty )
						{
							//AddTextToProgrammingLog("chkEmpty DS " + val + " passes. ");
						} else {
							AddTextToProgrammingLog("chkEmpty DS " + val + " failes. ");
							numOfFails++;
						}
						
					} else if ( fnvsChkList[fnvsChkIdx].indexOf('fnvs(') == 0 )
					{
						var firstIdx = fnvsChkList[fnvsChkIdx].indexOf('(') + 1;
						var endIdx = fnvsChkList[fnvsChkIdx].indexOf(')');
						var val = fnvsChkList[fnvsChkIdx].substring(firstIdx, endIdx);

						var fnvsChkParts = val.split("|");
				
						if ( fnvsChkParts.length == 3 &&
							 fnvsChkParts[2].indexOf('R') >= 0 )
						{
							if ( fnvsChkParts[0] == '79' )
							{
								continue;
							}
							
							var returnLines = RunCO_PCAN_Demo_WithOverlay( "-mode 4" + 
																		   " -br " + baudRate +
																		   " -tout " + "2" +
																		   " -nodeId " + selectedCharger["nodeId"] +
																		   " -dsId " + fnvsChkParts[0] +
																		   " -programmer_COBId " + selectedCharger["programmerCobId"] +
																		   " -charger_COBId " + selectedCharger["chargerCobId"] +
																		   " -channel " + selectedCharger["channel"],
																		   " Check DS Param Values..");

							var dsIdIndex = -1; //Current index reading from (dsIdsToRetrieve)
							var error, rawBytes;

							for (var i = 0; i < returnLines.length; i++) 
							{
								var line = returnLines[i];
								if (line.indexOf("READ DSID") != -1) 
								{	 
									//Look for keywork READ DSID, then the bytes following after this keywork will be the corresponding bytes.
									dsIdIndex++;
									error = "";
									rawBytes = "";
								} else if (line.indexOf("END READ") != -1) 
								{
									if (error != "") 
									{
									} else 
									{
										try 
										{
											rawBytes.trim();
											
											var rawByteStr = "";
											for ( var rawByteIdx = 0;
												  rawByteIdx < rawBytes.split(' ').length; rawByteIdx++ )
											{
												rawByteStr += rawBytes.split(' ')[rawByteIdx];
											}
											
											if ( rawByteStr.toLowerCase() == fnvsChkParts[1].toLowerCase() )
											{
												//AddTextToProgrammingLog("fnvsChk DS " + fnvsChkParts[0] + " matches. ");
											} else {
												AddTextToProgrammingLog("fnvsChk DS " + fnvsChkParts[0] + " mismatch. " );
												AddTextToProgrammingLog("  Expected: " + fnvsChkParts[1].toLowerCase() );
												AddTextToProgrammingLog("  Read:     " + rawByteStr.toLowerCase() );
												numOfFails++;
											}
											
										} catch (errorMsg) 
										{
										}
									}
								} else if (error == "" && line.indexOf("ErrorCodeAdditional") != -1) //Override error
								{
									error = "Failed to retrieve value.";
								} else if (hexRegex.test(line)) 
								{
									rawBytes += line;
								}
							}
						}	
					}
				}
				
				if ( numOfFails == 0 )
				{
					AddTextToProgrammingLog("All DS Value Check passes");	
				}
				
												
			}	
		}
	}

    function GetBaudRateFromFile() 
    {
        var shell = new ActiveXObject("Scripting.FileSystemObject");
        var batchFile = shell.OpenTextFile(crcFilePath, 1, false);
        var content = batchFile.ReadAll();
        var lines = content.split(/\r?\n/)

        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("nodeId") > -1) {
                var firstIdx = lines[i].indexOf('(') + 1;
                var endIdx = lines[i].indexOf(')');
                var val = lines[i].substring(firstIdx, endIdx);
                return val;
            }
        }
        return "";
    }

    function GetNodeIdFromFile() {
        var shell = new ActiveXObject("Scripting.FileSystemObject");
        var batchFile = shell.OpenTextFile(crcFilePath, 1, false);
        var content = batchFile.ReadAll();
        var lines = content.split(/\r?\n/)

        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("baudRate") > -1) {
                var firstIdx = lines[i].indexOf('(') + 1;
                var endIdx = lines[i].indexOf(')');
                var val = lines[i].substring(firstIdx, endIdx);
                return val;
            }
        }
        return "";
    }
}

// ****************************************************************************
function AddTextToProgrammingLog(text) {

    document.getElementById("ProgrammingLogText").innerHTML += text + "<br>";

    document.getElementById("ProgrammingLogText").scrollTop = document.getElementById("ProgrammingLogText").scrollHeight;
    
    //Record log to file in vault
    {
        var folderPath = "V:Software/Releases/IC CAN Reprogramming/logs/";

        var batFileWriteShell = new ActiveXObject("Scripting.FileSystemObject");
        if (!batFileWriteShell.FolderExists(folderPath)) { //Need to check if vault folder exists
            return;
        }

        var todayDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");;
        var userName = new ActiveXObject("WScript.Network").UserName;
        var fileName = "log_" + userName + "_" + todayDate + ".txt";

        var fullPath = folderPath + fileName;

        var batchFile = batFileWriteShell.OpenTextFile(fullPath, 8, true); //Use existing file or/ create new file if it doesn't exist (8 means appending to text file)
        batchFile.WriteLine(text);
        batchFile.Close();
    }
}

// ****************************************************************************
function ProgramProgressBarTimer(startTime, estimatedTime) 
{
    if ( document.getElementById("programmingProgress").style.backgroundColor != 'red' )
    {
        var now = new Date();
    	var timeDiff = now - startTime; //in ms
        // strip the ms
        timeDiff /= 1000;

        // get seconds 
        var secondsElapsed = Math.round(timeDiff);

        var percent = secondsElapsed / (estimatedTime) * 100;

        var percent = percent * 0.9; //Max of 90%

        if (percent > 90) 
		{
            percent = 90;
        }
        document.getElementById("programmingProgress").value = ((totalProgStep - toProgramList.length - 1) / totalProgStep * 100) + (percent / totalProgStep);
    } else {
        document.getElementById("programmingProgress").value = 0;
    }

}

//**************************************************************************************************************************************************************
//******************************************************************LOG DOWNLOAD********************************************************************************
//**************************************************************************************************************************************************************
function DownloadLogs(bDownloadStack) {

    DisableButtons(true);

    document.getElementById("logDownloadLogText").innerHTML = "";

    AddTextToLogDownloadLog(GetTextLogHeader("* Getting Logs From Device *"));

    var documentPath = unescape(document.location);
    documentPath = documentPath.substring(0,documentPath.indexOf(".html"));
    documentPath = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name

    var batFileWriteShell = new ActiveXObject("Scripting.FileSystemObject");
    if (!batFileWriteShell.FolderExists(documentPath + 'Logs')) {
        batFileWriteShell.CreateFolder(documentPath + 'Logs');
    }


    function pad2(n) { return n < 10 ? '0' + n : n }

    var date = new Date();

    var sessStr = date.getFullYear().toString() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + "-" + pad2(date.getHours()) + "-" + pad2(date.getMinutes()) + "-" + pad2(date.getSeconds());

    var nodeIdList = [];
    nodeIdList.push(selectedCharger["nodeId"]);

    if (bDownloadStack) {
        selectedCharger["secondaryChargers"].forEach(function (s) {
            nodeIdList.push(s);
        })
    }

    var callStr = "";
    if (nodeIdList.length == 1) {

        var pathToLogFile = documentPath + 'Logs/Log_' + GetSerialNumber(selectedCharger["nodeId"]) + '_' + sessStr + '.bin'
        batFileWriteShell.CreateTextFile(pathToLogFile, true);

        var uploadDataFileIdx = 12032;
        var subIdx = 1;
        callStr = "-mode 1"
            + " -br " + baudRate
            + " -tout " + "100"
            + " -nodeId " + selectedCharger["nodeId"]
            + " -rdIdx " + uploadDataFileIdx
            + " -rdSubIdx " + subIdx
            + " -rdSize " + "1000000"
            + " -programmer_COBId " + selectedCharger["programmerCobId"]
            + " -charger_COBId " + selectedCharger["chargerCobId"]
            + " -channel " + selectedCharger["channel"]
            + " -fout " + "\"" + pathToLogFile + "\"";

        AddTextToLogDownloadLog("creating log in " + "<a href='file:///" + documentPath + "Logs" + "'>" + pathToLogFile + "</a>");
    }
    else {
        callStr = "-mode 11"
            + " -br " + baudRate
            + " -tout " + "100"
            + " -nodeId " + selectedCharger["nodeId"]
            + " -programmer_COBId " + selectedCharger["programmerCobId"]
            + " -charger_COBId " + selectedCharger["chargerCobId"]
            + " -channel " + selectedCharger["channel"];

        var nodeIdToPathStr = "";
        nodeIdList.forEach(function (nodeId) {

            var pathToLogFile = documentPath + 'Logs/Log_' + GetSerialNumber(nodeId) + '_' + sessStr + '.bin'
            batFileWriteShell.CreateTextFile(pathToLogFile, true);

            nodeIdToPathStr += nodeId + "|" + pathToLogFile + "|";

            AddTextToLogDownloadLog("Creating log for node id: " + nodeId + " in " + "<a href='file:///" + documentPath + "Logs" + "'>" + pathToLogFile + "</a>");
        })

        callStr += " -nodeIdAndFile \"" + nodeIdToPathStr + "\"";
    }

    AddTextToLogDownloadLog("<br>CallStr: " + callStr);
    
    var sessResPath = Start_Batch_Call('CO_PCAN_Demo.exe', callStr, false);

    var fso = new ActiveXObject('Scripting.FileSystemObject');
    var flog = fso.OpenTextFile(sessResPath, 1, false);

    var readOutputFile = setInterval(function () {
        try {
            var line = flog.readLine();

            if (line.indexOf("Failed") != -1) {
                AddTextToLogDownloadLog("<red>" + line + "</red>");
            }
            else {
                AddTextToLogDownloadLog(line);
            }

            if (line.indexOf("Program End --") != -1) {
                flog.Close();
                clearInterval(readOutputFile);
                DisableButtons(false);
            }
        }
        catch (error) {

        }
    }, 50);

    AddTextToLogDownloadLog(GetTextLogHeader("Downloading"));
}

// ****************************************************************************
function AddTextToLogDownloadLog(text) {
    document.getElementById("logDownloadLogText").innerHTML += text + "<br>";
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************

function GetTextLogHeader(header) {
    return "<br><b>" + " [--" + header + "--] " + "</b><br>";
}

// ****************************************************************************
function GetValueFromCharger(readIdx, subIdx, size, nodeId, programmerCobId, chargerCobId, channel) {
    var returnLines = RunCO_PCAN_Demo_WithOverlay("-mode 1"
        + " -br " + baudRate
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -rdIdx " + readIdx
        + " -rdSubIdx " + subIdx
        + " -rdSize " + size
        + " -programmer_COBId " + programmerCobId
        + " -charger_COBId " + chargerCobId
        + " -channel " + channel,
        "Retreiving Info... ");
    var bytesArray = GetBytesArrayFromReturnLines(returnLines);

    return bytesArray;
}

// ****************************************************************************
function GetChargerHWVariant(nodeId) {
    var returnLines = RunCO_PCAN_Demo_WithOverlay("-mode 4"
        + " -br " + baudRate
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -channel " + selectedCharger["channel"]
        + " -dsId 3",
        "Retrieving HW Info");

    var returnBytes = GetBytesArrayFromReturnLines(returnLines);

    if (returnBytes != null && returnBytes.length >= 4) {
        chargerHWVariant = parseInt(returnBytes[0], 16);
        return chargerHWVariant;
    }
    else {
        return null;
    }
}

// ****************************************************************************
function ToggleCustomerInformation() {
    var content = document.getElementById("customerInfoContent");
    if (content.style.display == "") {
        content.style.display = "none";
    } else {
        content.style.display = "";
    }
}

// ****************************************************************************
function ToggleVerifyInformation() {
    var content = document.getElementById("verifyInfoContent");
    if (content.style.display == "") {
        content.style.display = "none";
    } else {
        content.style.display = "";
    }
}

//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
//**************************************************************************************************************************************************************
function ExternalDeviceAuthentication() 
{
    //if (!externalDeviceAuth)
    //    return;

    if (canUnhideKey != "") 
    {
        //Authenticate with given key
        RunCO_PCAN_Demo_WithOverlay("-mode 100"
            + " -br " + baudRate
            + " -tout " + "1"
            + " -nodeId " + selectedCharger["nodeId"]
            + " -programmer_COBId " + selectedCharger["programmerCobId"]
            + " -charger_COBId " + selectedCharger["chargerCobId"]
            + " -channel " + selectedCharger["channel"]
            + " -unhideKey " + canUnhideKey,
            "External device authentication");
    }
    else {
        //Authenticate with default key
        RunCO_PCAN_Demo_WithOverlay("-mode 100"
            + " -br " + baudRate
            + " -tout " + "1"
            + " -nodeId " + selectedCharger["nodeId"]
            + " -programmer_COBId " + selectedCharger["programmerCobId"]
            + " -charger_COBId " + selectedCharger["chargerCobId"]
            + " -channel " + selectedCharger["channel"],
            "External device authentication");
    }
}

// ****************************************************************************
function GetFaultsAndAlarms() 
{

    var table = document.getElementById("faultsAndAlarmsSection_table");

    table.innerHTML = "";
    //header
    {
        var header = table.createTHead();
        var row = header.insertRow(0);
        var cell = row.insertCell(0);

        var numOfFaults = sdoToValueMap["1003,0"];

        if (numOfFaults < 1)
            document.getElementById("faultsAndAlarmsSection").style.display = "none";
        else 
            document.getElementById("faultsAndAlarmsSection").style.display = "block";
        
        {
            
        }

        cell.innerHTML = "<b>Faults and alarms</b>";
        
        if (numOfFaults > 0)
        {
            var error = "";
            
            var callStr =   "-mode 101" +
                            " -br " + baudRate +
                            " -tout " + "2" +
                            " -nodeId " + selectedCharger["nodeId"] +
                            " -programmer_COBId " + selectedCharger["programmerCobId"] +
                            " -charger_COBId " + selectedCharger["chargerCobId"] +
                            " -channel " + selectedCharger["channel"] +
                            " -rdIdxAndSubIdxArray ";

            for (var i = 1; i < numOfFaults + 1; i++)
            {
                callStr += "4099," + i + ",";
            }
            callStr = callStr.substring(0, callStr.length - 1); //Remove last ','
            
            var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Retrieving Alarm Faults.");
            
            var faultIdx = 0;
            for (var i = 0; i < returnLines.length; i++) 
            {
                var line = returnLines[i];

                if (line.indexOf("START READ") != -1) 
                { //Look for keywork READ SDO, then the bytes following after this keywork will be the corresponding bytes.
                    faultIdx++;
                    error = "";
                    rawBytes = "";
                }
                else if (line.indexOf("END READ") != -1) 
                {
                    if (error != "") 
                    {
                        sdoToValueMap["1003," + faultIdx.toString()] = error;
                    } else 
                    {
                        try 
                        {
                            rawBytes.trim();
                            var bytesArray = rawBytes.split(' ');
                            sdoToValueMap["1003," + faultIdx.toString()] = InterpretSDO("1003", faultIdx.toString(), bytesArray);
                        } catch (errorMsg) 
                        {
                            sdoToValueMap["1003," + faultIdx.toString()] = errorMsg;
                        }
                    }
                }
                else if (error == "" && line.indexOf("Failed") != -1) //Override error
                {
                    error = "Failed to retrieve value.";
                }
                else if (hexRegex.test(line)) {
                    rawBytes += line;
                }
            }
        }
        
    
        for (var i = 1; i < numOfFaults + 1; i++) 
        {
            var faultString = sdoToValueMap["1003," + i.toString()];

            var newRow = table.insertRow();
            var cell = newRow.insertCell(0);
            var text = document.createElement("red");
            text.innerHTML = faultString;
            cell.appendChild(text);
        }
    }
}

// ****************************************************************************
function UpdateTitleAndBaudRate( newNodeId, newBaudRate )
{
    baudRate = newBaudRate;
    selectedCharger["nodeId"] = newNodeId;
    document.title = "Node ID: " + selectedCharger["nodeId"];
    
    var nodeIdElement = document.getElementById("nodeId");
    if (nodeIdElement != undefined) 
    {
        nodeIdElement.innerHTML = newNodeId;
    }
    
    var baudRateElement = document.getElementById("baudRate");
    if (baudRateElement != undefined) 
    {
        baudRateElement.innerHTML = newBaudRate;
    }
}

// ****************************************************************************
function ClearDsId(dsId) 
{
    RunCO_PCAN_Demo_WithOverlay("-mode 7"
        + " -br " + baudRate
        + " -tout " + "1"
        + " -nodeId " + selectedCharger["nodeId"]
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -dsId " + dsId,
        "Clearing field...");
}

// ****************************************************************************
function GetSerialNumber(nodeId) 
{

    var indexTwo = InterpretSDO("1018", "2", GetValueFromCharger("4120", "2", "1", nodeId, selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], selectedCharger["channel"]));
    if (indexTwo == "DEFAUL")
        return "DEFAULT_SERIAL_NUMBER-12345678";

    var indexFour = "";
    var dsVal = "";
    try {
        var indexFour = InterpretSDO("1018", "4", GetValueFromCharger("4120", "4", "1", nodeId, selectedCharger["programmerCobId"], selectedCharger["chargerCobId"], selectedCharger["channel"]));
        
        if ( indexFour == "Invalid serial number" )
        {
            dsVal = GetSerialNumberFromDS( nodeId );
            indexTwo = "";
            indexFour = "";
        }
    } catch (e) {
        return e;
    }
   
    return indexTwo + indexFour + dsVal;
}

// ****************************************************************************
function GetSerialNumberFromDS(nodeId) {
    var returnLines = RunCO_PCAN_Demo_WithOverlay("-mode 4"
        + " -br " + baudRate
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -programmer_COBId " + selectedCharger["programmerCobId"]
        + " -charger_COBId " + selectedCharger["chargerCobId"]
        + " -channel " + selectedCharger["channel"]
        + " -dsId 0",
        "Retrieving Serial Num From DS");

    var returnBytes = GetBytesArrayFromReturnLines(returnLines);
    return InterpretType(ASCII, returnBytes);
}


// ****************************************************************************
function GetDevices(baudRateGuessesList, channel, programmerCobId, chargerCobId, usePassiveListen) 
{

    var nodeIdsString = "";

    var nodeIdsString = "";
    for (var i = 1; i <= 127; i++) {
        nodeIdsString += i.toString() + ",";
    }
    nodeIdsString = nodeIdsString.substring(0, nodeIdsString.length - 1);

    var detectedNodeIds = [];
    var detectedNodeIdToHB = {};
    var detectedBaudRate = "";
    
    var passiveDetect = '';
    if ( baudRateGuessesList.length > 0 &&
         baudRateGuessesList[0] != '' &&
         usePassiveListen )
    {
        passiveDetect = RunPassiveTrafficDetect_WithOverlay( channel, baudRateGuessesList, "" );
    }
    
    var passiveFilteredBaudRateGuessesList = [];
    if ( passiveDetect != '' )
    {
        for (var i = 0; i < baudRateGuessesList.length; i++) 
        {
            if ( baudRateGuessesList[i] == passiveDetect )
            {
                passiveFilteredBaudRateGuessesList.push(baudRateGuessesList[i]);
            }
        }
    } else {
        for (var i = 0; i < baudRateGuessesList.length; i++) 
        {
            passiveFilteredBaudRateGuessesList.push(baudRateGuessesList[i]);
        }
    }

    for (var i = 0; i < passiveFilteredBaudRateGuessesList.length; i++) 
    {
        // Throw away call to clear the dongle/device
        // so that the next -mode 13 call would succeed.
        //
        RunCO_PCAN_Demo_WithOverlay("-mode 1 " +
									"-br " + passiveFilteredBaudRateGuessesList[i] + " " +
									"-tout 1 " +
									"-nodeId 10 " +
									"-rdIdx 8022 -rdSubIdx 1 -rdSize 4 ", 
									"");

    
        var callStr = "-mode 13 " +
            " -br " + passiveFilteredBaudRateGuessesList[i] +
            " -tout " + "10" +
            " -nodeIdArray " + nodeIdsString +
            " -channel " + channel +
            " -programmer_COBId " + programmerCobId +
            " -charger_COBId " + chargerCobId +
            " -rdIdxAndSubIdxArray " + "8022,0";

        var returnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Detecting devices...");

        var devicesFound = false;
        detectedBaudRate = passiveFilteredBaudRateGuessesList[i];

        for (var j = 0; j < returnLines.length; j++) 
        {
            var line = returnLines[j];

            if (line.indexOf("successful") > -1) {
                devicesFound = true;

                var regEx = /\d+/g;
                var foundNodeId = parseInt(line.match(regEx)[0]);
                detectedNodeIds.push(foundNodeId);
		
		detectedNodeIdToHB[foundNodeId] = line.match(regEx)[1];
            }
        }

        if (devicesFound)
            break;

    }

    if (!devicesFound) 
    {
        return { "list": [], "br": "" };
    }

    var detectedNodeIdsString = "";
    for (var i = 0; i < detectedNodeIds.length; i++) 
    {
        detectedNodeIdsString += detectedNodeIds[i].toString() + ",";
    }
    detectedNodeIdsString = detectedNodeIdsString.substring(0, detectedNodeIdsString.length - 1);

    //Read number of secondary chargers for each detected node ID
    var callStr = "-mode 12 " +
        " -br " + detectedBaudRate +
        " -tout " + "1" +
        " -nodeIdArray " + detectedNodeIdsString +
        " -rdIdxAndSubIdxArray " + "16512,0" +
        " -rdSize " + "4" +
        " -channel " + channel +
        " -programmer_COBId " + programmerCobId +
        " -charger_COBId " + chargerCobId;
    var numOfSecondaryReturnLines = RunCO_PCAN_Demo_WithOverlay(callStr, "Detecting devices...");

    var devicesList = [];
    var allSecondaries = [];

    for (var i = 0; i < numOfSecondaryReturnLines.length; i++) 
    {
        var line = numOfSecondaryReturnLines[i];

        if (line.indexOf("successful") > -1) 
        {
            var regEx = /\d+/;
            var thisNodeId = parseInt(line.match(regEx)[0]);

            var numOfSecondary = parseInt(line.split("Read successful.")[1], 16);
            var secodaryNodeIds = [];

            for (var j = 1; j <= numOfSecondary; j++) 
            {
                var secondaryNodeIdStrReturnLines = RunCO_PCAN_Demo_WithOverlay("-mode 1 " +
                    " -br " + detectedBaudRate +
                    " -tout " + "1" +
                    " -nodeId " + thisNodeId +
                    " -rdIdx " + "16512" +
                    " -rdSubIdx " + j.toString() +
                    " -rdSize " + "4" +
                    " -channel " + channel +
                    " -programmer_COBId " + programmerCobId +
                    " -charger_COBId " + chargerCobId,
                    "Detecting devices...");

                var secondaryNodeId = parseInt(GetBytesArrayFromReturnLines(secondaryNodeIdStrReturnLines), 16);
                allSecondaries.push(secondaryNodeId);
                secodaryNodeIds.push(secondaryNodeId);
            }

            var thisHWVar = GetHWVar(thisNodeId, programmerCobId, chargerCobId, channel, detectedBaudRate );
            var thisChargerModel = HWVariantToName[thisHWVar];            
            if ( thisChargerModel == null || thisChargerModel == undefined )
            {
                thisChargerModel = "Unknown device";
            }
            
            devicesList.push(
                {
                    nodeId: thisNodeId,
                    programmerCobId: programmerCobId,
                    chargerCobId: chargerCobId,
                    channel: channel,
                    secondaryChargers: secodaryNodeIds,
                    isSecondary: "false",
                    hwVar: thisHWVar,
                    chargerModel: thisChargerModel
                    
                }
            );
        }
        else if (line.indexOf("Failed to read!") > -1) 
        {
            var regEx = /\d+/;
            var thisNodeId = parseInt(line.match(regEx)[0]);
            var thisHWVar = GetHWVar(thisNodeId, programmerCobId, chargerCobId, channel, detectedBaudRate );
            var thisChargerModel = HWVariantToName[thisHWVar];
            if ( thisChargerModel == null || thisChargerModel == undefined )
            {
                thisChargerModel = "Unknown device";
            }
            
            devicesList.push(
                {
                    nodeId: thisNodeId,
                    programmerCobId: programmerCobId,
                    chargerCobId: chargerCobId,
                    channel: channel,
                    secondaryChargers: [],
                    isSecondary: "false",
                    hwVar: thisHWVar,
                    chargerModel: thisChargerModel
                }
            );
        }
    }

    //Remove duplicates
    for (var i = devicesList.length - 1; i >= 0; i--) 
	{
        if (allSecondaries.indexOf(devicesList[i]["nodeId"]) > -1) 
		{
            devicesList[i]['isSecondary']='true';
        }
    }
    
    // Restore NMT status since it was put into preop
    // when scanning
    //
    for (var i = devicesList.length - 1; i >= 0; i--)
    {
        // reading 0x1f80 for nmt startup
        //
        baudRate = detectedBaudRate;
        var nmtStartUpBytesArray = GetValueFromCharger("8064", "0", "1", 
                                                       devicesList[i]["nodeId"], 
                                                       devicesList[i]["programmerCobId"], 
                                                       devicesList[i]["chargerCobId"], 
                                                       devicesList[i]["channel"]);
                                                       
        if ( nmtStartUpBytesArray != null &&
	     nmtStartUpBytesArray[0] == "08" )
        {
	    // restore nmt node
            var callStr = " -mode 14 " +
                          " -br " + detectedBaudRate +
                          " -tout " + "10" +
                          " -nodeId " + devicesList[i]["nodeId"];
                          
            RunCO_PCAN_Demo(callStr);
        }
        {
	    // restore HB
	    var callStr = " -mode 2 " +
                          " -br " + detectedBaudRate +
                          " -tout " + "10" +
                          " -nodeId " + devicesList[i]["nodeId"] +
			  " -wrIdx 4119 -wrSubIdx 0 -wrSize 2" +
			  " -wrVal " + detectedNodeIdToHB[devicesList[i]["nodeId"]];

            RunCO_PCAN_Demo(callStr);
	}
    }

    return { "list": devicesList, "br": detectedBaudRate };
}

// ****************************************************************************
function GetHWVar(nodeId, programmerCobId, chargerCobId, channel, br ) 
{    
    RunCO_PCAN_Demo("-mode 100"
            + " -br " + br
            + " -tout " + "1"
            + " -nodeId " + nodeId
            + " -programmer_COBId " + programmerCobId
            + " -charger_COBId " + chargerCobId
            + " -channel " + channel);
    
    var returnLines = RunCO_PCAN_Demo("-mode 4"
        + " -br " + br
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -programmer_COBId " + programmerCobId
        + " -charger_COBId " + chargerCobId
        + " -channel " + channel
        + " -dsId 3");

    var returnBytes = GetBytesArrayFromReturnLines(returnLines);

    var chargerHWVariant = "";
    if (returnBytes != null && returnBytes.length >= 4) {
        chargerHWVariant = parseInt(returnBytes[1] + returnBytes[0], 16);
    }

    return chargerHWVariant;
    
}

// ****************************************************************************
function WriteToStorage(key, value) {
    var documentPath = unescape(document.location);
    documentPath = documentPath.substring(0,documentPath.indexOf(".html"));
    var folderPath = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name
    var storagePath = folderPath + "Support/Storage.txt";

    var shell = new ActiveXObject("Scripting.FileSystemObject");
    var readTxtFile = shell.OpenTextFile(storagePath, 1, false);

    var storageJson;
    try {
        var content = readTxtFile.ReadAll();
        storageJson = JSON.parse(content);
    } catch (e) {
        storageJson = {};
    }

    storageJson[key] = value;

    readTxtFile.Close();

    var writeTxtFile = shell.OpenTextFile(storagePath, 2, false);
    writeTxtFile.Writeline(JSON.stringify(storageJson));

   writeTxtFile.Close();
}

// ****************************************************************************
function GetStorageValue(key) 
{
    var documentPath = unescape(document.location);
    documentPath = documentPath.substring(0,documentPath.indexOf(".html"));
    var folderPath = documentPath.substring(8, documentPath.lastIndexOf("/") + 1); //chop off "file:///" and file name
    var storagePath = folderPath + "Support/Storage.txt";

    var shell = new ActiveXObject("Scripting.FileSystemObject");
    var readTxtFile = shell.OpenTextFile(storagePath, 1, false);
    var content = readTxtFile.ReadAll();

    var storageJson = JSON.parse(content);

    readTxtFile.Close();

    return storageJson[key];
}

// ****************************************************************************
function DisableButtons(bDisable) {

    if (bDisable)
        CancelModifyMode();

    document.getElementById("RefreshButton").disabled = bDisable;
    document.getElementById("programStartButton").disabled = bDisable;
    document.getElementById("logDownloadStackButton").disabled = bDisable;
    document.getElementById("logDownloadButton").disabled = bDisable;
    document.getElementById("modifyButton").disabled = bDisable;
}
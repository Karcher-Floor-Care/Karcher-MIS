var devicesList = [];

/*
    * Added for SSP-9637: Write/Read select charger configuration settingsselectedCharger["programmerCobId"], selectedCharger["chargerCobId"], selectedCharger["channel"]
*/
function DetectConfiguration(usePassive) 
{
    var channel = document.getElementById("channel").value;

    var baudRateGuesses = [];
    //Get baudrate from checked boxes
    {
        var checkboxes = document.querySelectorAll('input[type=checkbox]:checked')

        for (var i = 0; i < checkboxes.length; i++) 
        {
            baudRateGuesses.push(checkboxes[i].value)
        }
    }

    var programmerCobId = parseInt(document.getElementById("programmerCobId").value, 16);
    var chargerCobId = parseInt(document.getElementById("chargerCobId").value, 16);

    var devices = GetDevices(baudRateGuesses, channel, programmerCobId, chargerCobId, usePassive);
    devicesList = devices["list"];

    WriteToStorage("br", devices["br"]);
}

// ****************************************************************************
function GetCobsIdFromEds() {

    var programmerCobId = "580";
    var chargerCobId = "600";

    var file = document.getElementById("edsFileSelect").files[0];
    var reader = new FileReader();
    reader.onload = function (progressEvent) {
        // Read lines
        var lines = this.result.split('\n');

        var hexRegex = new RegExp("0x([0-9A-F]+)"); //regex to find cobId in default value

        var programmerCobIdHeaderString = "[1200sub1]";
        var chargerCobIdHeaderString = "[1200sub2]";

        //Get cobIds from EDS
        for (var i = 0; i < lines.length; i++) {

            if (lines[i].indexOf(programmerCobIdHeaderString) != -1) {
                programmerCobId = FindNextCobIdValue(i);
            }
            else if (lines[i].indexOf(chargerCobIdHeaderString) != -1) {
                chargerCobId = FindNextCobIdValue(i);
            }

            function FindNextCobIdValue(currentIndex) {
                while (true) {
                    currentIndex++;
                    var paramToValueSplit = lines[currentIndex].split('=');
                    var paramName = paramToValueSplit[0];
                    if (paramName == "DefaultValue") {
                        var paramValue = paramToValueSplit[1]; //This will be in format like this: $NODEID+0x146 ... we need to extract the 0x146 part
                        var hexMatch = hexRegex.exec(paramValue)[0];
                        var cobsId = hexMatch.substring(2, hexMatch.length);
                        return cobsId;
                    }
                }
            }
        }

        document.getElementById("edsFileIndicator").setAttribute("src", "Support/Good.png");
        document.getElementById("edsFileIndicatorMessage").setAttribute("title", "EDS file has been loaded.");

        document.getElementById("chargerCobId").value = chargerCobId;
        document.getElementById("programmerCobId").value = programmerCobId;
    };

    reader.readAsText(file);
}

/*
*  Added for SSP-9637: Write/Read select charger configuration settings
*/
function InitializeList() 
{
    var listElement = document.getElementById("ChargerSelectionList");
    listElement.innerHTML = "";

    if (devicesList.length == 0) 
    {
        alert("No devices detected");
        return;
    }

    var tempList = [];

    for (var i = 0; i < devicesList.length; i++) 
    {
        var chargerModel = devicesList[i]["chargerModel"];
		if ( devicesList[i]["isSecondary"] == 'false' )
		{
	        var button = CreateButton(devicesList[i], chargerModel, false, ((chargerModel == "VCIM") ? "" : "Primary charger: ") + chargerModel + " Node id: " + devicesList[i]["nodeId"]);
			tempList.push(button);

			if (devicesList[i]["secondaryChargers"].length > 0) 
			{
				for (var j = 0; j < devicesList[i]["secondaryChargers"].length; j++) 
				{
					var programmerCobId = parseInt(document.getElementById("programmerCobId").value, 16);
					var chargerCobId = parseInt(document.getElementById("chargerCobId").value, 16);
					var channel = document.getElementById("channel").value;
					
					// Check to make sure that the secondary nodeId actually
					// exists in the scan...
					//
					var secondaryNodeIDExist = false;
					for ( var k = 0; k < devicesList.length; k++ )
					{
						if (devicesList[k]["nodeId"] == devicesList[i]["secondaryChargers"][j])
						{
							secondaryNodeIDExist = true;
						}
					}
					
					if ( secondaryNodeIDExist )
					{
						var secondaryJson = 
						{
							nodeId: devicesList[i]["secondaryChargers"][j],
							programmerCobId: programmerCobId,
							chargerCobId: chargerCobId,
							channel: channel,
							secondaryChargers: [],
							isSecondary: "true",
						}

						var secondaryButton = CreateButton(secondaryJson, chargerModel, true, "Secondary charger: " + chargerModel + " Node id: " + secondaryJson["nodeId"]);
						tempList.push(secondaryButton);    
					}
					
					
				}
			}
		}
    }

    for (var i = 0; i < tempList.length; i++) 
    {
        listElement.appendChild(tempList[i]);
    }
}

// ****************************************************************************
function CreateButton(json, chargerModel, createBracket, name) 
{
    var div = document.createElement("div");

    if (createBracket) 
    {
        var bracket = document.createElement("img");
        bracket.setAttribute("src", "Support/Bracket.png");
        bracket.setAttribute("width", "20px");
        bracket.setAttribute("height", "20px");
        div.appendChild(bracket);
    }

    var button = document.createElement("button");
    button.setAttribute('class', 'tablinks');
    button.setAttribute('onclick', 'window.open(\'SummaryLayout.html?charger=' + JSON.stringify(json) + '\')');
    button.innerHTML = name;
    div.appendChild(button);

    //Display warning if no algo set for that charger
    if (chargerModel != "VCIM") 
    {
        if (GetActiveAlgoInDevice(json["nodeId"]) == 0xFFFFFFFF) 
        {
            var message = document.createElement("span");
            message.setAttribute("class", "toolTip");
            message.setAttribute("title", "No Algo selected. The charger will not charge.");

            var warningImg = document.createElement("img");
            warningImg.setAttribute("src", "Support/Warning.svg");

            message.appendChild(warningImg);
            div.appendChild(message);
        }
    }

    return div;
}

// ****************************************************************************
function SpecifyNodeIdTab()
{
    var returnNodeID_BaudRate = prompt("Enter NodeID,BaudRate","10,125");
    if ( returnNodeID_BaudRate.split(",").length != 2 )
    {
        return;
    }
    
    var thisDevice = 
    {
        nodeId: parseInt(returnNodeID_BaudRate.split(",")[0]),
        baudRate: returnNodeID_BaudRate.split(",")[1],
        programmerCobId: parseInt(document.getElementById("programmerCobId").value, 16),
        chargerCobId: parseInt(document.getElementById("chargerCobId").value, 16),
        channel: document.getElementById("channel").value,
        secondaryChargers: [],
        isSecondary: "false"
    };
    
    var listElement = document.getElementById("ChargerSelectionList");
    
    var thisBtn = CreateButton(thisDevice, "", false, "Spec. Device Node id: " + thisDevice["nodeId"]);
    
    listElement.appendChild(thisBtn);

    window.open('SummaryLayout.html?charger=' + JSON.stringify(thisDevice) );
}

// ****************************************************************************
function RefreshDeviceListNoPassive()
{
    DetectConfiguration(false);
    InitializeList();
}

// ****************************************************************************
function RefreshDeviceList()
{
    DetectConfiguration(true);
    InitializeList();
}

// ****************************************************************************
function GetActiveAlgoInDevice(nodeId) {
    var programmerCobId = parseInt(document.getElementById("programmerCobId").value, 16);
    var chargerCobId = parseInt(document.getElementById("chargerCobId").value, 16);
    var br = GetStorageValue("br");
    var channel = document.getElementById("channel").value;

    var callStr = "-mode 1"
        + " -br " + br
        + " -tout " + "1"
        + " -nodeId " + nodeId
        + " -rdIdx 8769"
        + " -rdSubIdx 0"
        + " -programmer_COBId " + programmerCobId
        + " -charger_COBId " + chargerCobId
        + " -channel " + channel
        + " -rdSize 1";

    var returnLines = RunCO_PCAN_Demo(callStr);
    var returnBytes = GetBytesArrayFromReturnLines(returnLines);
    var algoProfile = InterpretSDO("2241", "0", returnBytes);

    return algoProfile;
}

// ****************************************************************************
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

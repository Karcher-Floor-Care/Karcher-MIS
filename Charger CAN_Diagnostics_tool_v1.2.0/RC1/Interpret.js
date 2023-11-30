var ASCII   = 0;
var FLOAT32 = 1;
var UINT32  = 2;
var UINT16  = 3;
var UINT8   = 4;
var UINT8ARRAY  = 5;
var UINT32ARRAY = 6;
var PRIMITIVE   = 7;
var BOOL        = 8;
var SOFTWAREFORMAT_FROM_BYTES = 9;
var SOFTWAREFORMAT_FROM_ASCII = 10;
var CHARGINGPROFILEFORMAT = 11;
var FLOAT32_ROUNDED       = 12;
var FAULTS = 13;
var SERIAL_NUMBER_4 = 14;
var SERIAL_NUMBER_2 = 15;
var FLOAT32_BIG_ENDIAN = 16;
var FLOAT32_BIG_ENDIAN_ROUNDED = 17;
var UINT16_HEX = 18;
var CABLERES = 19;

var alarmCodeToDescDictionary = {};
var faultCodeToDescDictionary = {};
var highPriorityAlarmCodeToDescDictionary = {};
            

var NON_ZERO = 0;

var dsIdTypes = {
    "0": ASCII,
    "1": ASCII,
    "3": UINT8ARRAY,
    "4": CABLERES,
    "8": UINT32,
    "9": UINT32,
    "10": UINT32,
    "15": UINT32,
    "16": UINT32,
    "17": UINT32,
    "18": UINT32,
    "19": UINT32,
    "20": UINT32,
    "21": UINT32,
    "25": SOFTWAREFORMAT_FROM_BYTES,
    "27": CHARGINGPROFILEFORMAT,
    "67": PRIMITIVE,
    "71": ASCII,
    "75": UINT16,
    "77": UINT32,
    "86": BOOL,
    "151": FLOAT32_BIG_ENDIAN_ROUNDED,
    "156": FLOAT32_BIG_ENDIAN_ROUNDED,
    "172": FLOAT32,
    "174": FLOAT32,
    "183": FLOAT32,
    "234": BOOL,
    "239": ASCII,
    "241": UINT16,
    "287": ASCII,
    "288": ASCII,
    "290": ASCII,
    "293": ASCII,
    "297": FLOAT32_ROUNDED,
    "309": FLOAT32_ROUNDED,
    "350": UINT32,
    "365": UINT32ARRAY,
}

var sdoTypes = {
    "1018,2": SERIAL_NUMBER_2,
    "1018,4": SERIAL_NUMBER_4,
    "2241": UINT32,
    "2275": UINT8,
    "2500": UINT32,
    "2244": PRIMITIVE,
    "100A": SOFTWAREFORMAT_FROM_ASCII,
    "2242": UINT8,
    "1003,0": UINT8,
    "1003,1": FAULTS,
    "1003,2": FAULTS,
    "1003,3": FAULTS,
    "1003,4": FAULTS,
    "1003,5": FAULTS,
    "1003,6": FAULTS,
    "1003,7": FAULTS,
    "1003,8": FAULTS,
    "1003,9": FAULTS,
    "1003,10": FAULTS,
    "1f56,1": UINT16_HEX
}

var dsIdUnits = {
    "4": "mΩ",
    "172": "Ah",
    "174": "V",
    "297": "A",
    "309": "V",
    "156": "kb/s"
}

// Exceptions, if a translated value falls into an exception,
// it will return an error
var exceptions = {
    "172": NON_ZERO, // if batteryCapacity is 0, it means there is no value
    "174": NON_ZERO, // if batteryPackTargetVoltage is 0, it means there is no value
    "297": NON_ZERO, // if maxCurrent is 0, it means there is no value
    "309": NON_ZERO  // if maxVoltage is 0, it means there is no value
}

var sdoUnits = {
    "2275": "mΩ",
}

//Variant names
var variantDict = {
    0: "Standard",
    1: "Club Car",
    2: "Bosch onboard",
    3: "Bosch offboard",
    4: "Bosch home",
    5: "EZ350",
    6: "DC On",
    255: "Production",
}

//Interpret SDO
function InterpretSDO(readIdx, readSubIdx, bytesArray) {

    var type = undefined;

    //Check if we can get type by just with readIdx
    if (sdoTypes[readIdx] != undefined) {
        type = sdoTypes[readIdx];
    }
    //If not, we can get the type with readIdx + readSubIdx
    else if (sdoTypes[readIdx + "," + readSubIdx] != undefined) {
        type = sdoTypes[readIdx + "," + readSubIdx];
    }
    else {
        throw "Type unknown for sdo: " + readIdx + "," + readSubIdx;
    }

    var result = InterpretType(type, bytesArray);

    //alert(readIdx + " " + result + " " + bytesArray);

    if (sdoUnits[readIdx] != undefined) {
        result += " " + sdoUnits[readIdx];
    }
    else if (sdoUnits[readIdx + "," + readSubIdx] != undefined) {
        result += sdoUnits[readIdx + "," + readSubIdx];
    }

    return result;
}

//Interpret with DSID
function InterpretDS(id, bytesArray) {
    var type = dsIdTypes[id];

    if (type == undefined || type == null) {
        throw "Type unknown for dsID: " + id;
    }


    var result = InterpretType(type, bytesArray);

    if (exceptions[id] != undefined) {
        switch (exceptions[id]) {
            case (NON_ZERO):
                if (result == 0)
                    throw "No value found.";
                break;

            default:
                break;
        }
    }

    if (dsIdUnits[id] != undefined) {
        result += " " + dsIdUnits[id];
    }

    return result;
}

function InterpretType(type, bytesArray) {

    if (bytesArray == null ||
        bytesArray.length < 1) 
    {
        //throw "No value found for type " + type;
        return "No value found";
    }

    var result = "";

    switch (type) {
        case (ASCII):
            for (var i = 0; i < bytesArray.length; i++) {
                if (Number(bytesArray[i], 16) != 0) {
                    result += String.fromCharCode(parseInt(bytesArray[i], 16));
                }
            }
            if (result === "") 
            {
                //throw "No value found.";
                return "No value found.";
            }
            break;

        case (FLOAT32):
            var data = new ArrayBuffer(4);
            for (var i = 0; i < 4; i++) 
            {                
                data[3-i] = parseInt(bytesArray[i], 16)
            }

            var buf = new ArrayBuffer(4);
            // Create a data view of it
            var view = new DataView(buf);

            // set bytes
            for (var i = 0; i < 4; i++) {
                view.setUint8(i, data[i]);
            }

            // Read the bits as a float; note that by doing this, we're implicitly
            // converting it from a 32-bit float into JavaScript's native 64-bit double
            var num = view.getFloat32(0);

            result = num;
            break;
            
        case (CABLERES):
        
            var data = new ArrayBuffer(4);
            for (var i = 0; i < 4; i++) 
            {                
                data[3-i] = parseInt(bytesArray[i], 16)
            }

            var buf = new ArrayBuffer(4);
            // Create a data view of it
            var view = new DataView(buf);

            // set bytes
            for (var i = 0; i < 4; i++) {
                view.setUint8(i, data[i]);
            }

            // Read the bits as a float; note that by doing this, we're implicitly
            // converting it from a 32-bit float into JavaScript's native 64-bit double
            var num = view.getFloat32(0);

            result = (num * 1000).toFixed(0);
            break;
        

        case (FLOAT32_BIG_ENDIAN):
            var data = new ArrayBuffer(4);
            data[0] = parseInt(bytesArray[3], 16);
            data[1] = parseInt(bytesArray[2], 16);
            data[2] = parseInt(bytesArray[1], 16);
            data[3] = parseInt(bytesArray[0], 16);

            var buf = new ArrayBuffer(4);
            // Create a data view of it
            var view = new DataView(buf);

            // set bytes
            for (var i = 0; i < 4; i++) {
                view.setUint8(i, data[i]);
            }

            // Read the bits as a float; note that by doing this, we're implicitly
            // converting it from a 32-bit float into JavaScript's native 64-bit double
            var num = view.getFloat32(0);

            result = num;
            break;


        case (FLOAT32_ROUNDED):
            var data = new ArrayBuffer(4);
            for (var i = 0; i < 4; i++) {
                data[3-i] = parseInt(bytesArray[i], 16)
            }

            var buf = new ArrayBuffer(4);
            // Create a data view of it
            var view = new DataView(buf);

            // set bytes
            for (var i = 0; i < 4; i++) {
                view.setUint8(i, data[i]);
            }

            // Read the bits as a float; note that by doing this, we're implicitly
            // converting it from a 32-bit float into JavaScript's native 64-bit double
            var num = view.getFloat32(0);

            result = Number((num).toFixed(1));
            break;

        case (FLOAT32_BIG_ENDIAN_ROUNDED):
            var data = new ArrayBuffer(4);
            data[0] = parseInt(bytesArray[3], 16);
            data[1] = parseInt(bytesArray[2], 16);
            data[2] = parseInt(bytesArray[1], 16);
            data[3] = parseInt(bytesArray[0], 16);

            var buf = new ArrayBuffer(4);
            // Create a data view of it
            var view = new DataView(buf);

            // set bytes
            for (var i = 0; i < 4; i++) {
                view.setUint8(i, data[i]);
            }

            // Read the bits as a float; note that by doing this, we're implicitly
            // converting it from a 32-bit float into JavaScript's native 64-bit double
            var num = view.getFloat32(0);

            result = Number((num).toFixed(3));
            break;

        case (PRIMITIVE):
            result = bytesArray;
            break;

        case (UINT32):
            var hex = bytesArray[3] + bytesArray[2] + bytesArray[1] + bytesArray[0];
            result = parseInt(hex, 16);
            break;

        case (UINT16):
            var hex = bytesArray[1] + bytesArray[0];
            result = parseInt(hex, 16);
            break;

        case (UINT16_HEX):
            result = bytesArray[1].toString() + bytesArray[0].toString();
            
            break;
            
        case (UINT8):
            var hex = bytesArray[0];
            result = parseInt(hex, 16);
            break;

        case (UINT8ARRAY):
            var resultArray = [];
            for (var i = 0; i < bytesArray.length; i++) {
                var hex = bytesArray[i];
                var int = parseInt(hex, 16);
                if (!isNaN(int))
                    resultArray.push(int);
            }

            result = resultArray;
            break;


        case (UINT32ARRAY):

            var resultArray = [];

            if (bytesArray.length <= 4)
                throw "No value found.";

            for (var i = 0; i + 3 < bytesArray.length; i += 4) {
                var hex = bytesArray[i + 3] + bytesArray[i + 2] + bytesArray[i + 1] + bytesArray[i + 0];
                var int = parseInt(hex, 16);
                if (!isNaN(int))
                    resultArray.push(int);
            }

            result = resultArray;
            break;

        case (BOOL):
            result = (parseInt(bytesArray[0]) == 1);
            break;

        case (SOFTWAREFORMAT_FROM_BYTES):
            // Byte 0: Major
            // Byte 1: Minor
            // Byte 2-3: Variant
            // Byte 4-5: Build
            //
            // We will convert this in to format: Major.Minor.Build VariantName

            if (bytesArray.length >= 6) {
                var result = "";
                result += "v" + parseInt(bytesArray[0]) + "." + parseInt(bytesArray[1]) + "." + parseInt(bytesArray[4] + bytesArray[5], 16);
                var variantNum = parseInt(bytesArray[3]);
                result += " " + variantDict[variantNum] + " Variant";
            }
            else 
            {
                //throw "Invalid software format";
                return "Invalid software format";
            }

            break;

        case (SOFTWAREFORMAT_FROM_ASCII):
            // ASCII will be in the format:
            // SwMajor.SwMinor.Build#Variant
            // Example: 009.004.00000#00008
            //
            // We will convert this in to format: Ex. 9.4.0 VariantName
            {
                try {
                    var ascii = InterpretType(ASCII, bytesArray);
                    var splitVersionAndVariant = ascii.split('#');
                    var versionString = splitVersionAndVariant[0];
                    var variantString = splitVersionAndVariant[1];

                    var versionSplit = versionString.split('.');
                    var swMajor = parseInt(versionSplit[0]);
                    var swMinor = parseInt(versionSplit[1]);
                    var swBuild = parseInt(versionSplit[2]);
                    var swVariant = variantDict[parseInt(variantString) >> 8];

                    result = "v" + swMajor + "." + swMinor + "." + swBuild + " " + swVariant + " " + "Variant";

                } catch (e) {
                    //throw "Invalid software format";
                    return "Invalid software format";
                }
            }
            break;


        case (CHARGINGPROFILEFORMAT):
            if (bytesArray.length >= 4) {
                var algoVariant = parseInt(bytesArray[1] + bytesArray[0], 16)
                var major = parseInt(bytesArray[2], 16);
                var minor = parseInt(bytesArray[3], 16);
                if (minor < 10)
                    minor = "0" + minor.toString();
                result = "Algo #" + algoVariant + " v" + major + "." + minor;
            } else {
                //throw "Invalid charging profile format";
                return "Invalid charging profile format";
            }
            break;

        // NOTE: Due to an idiosyncrasy in Delta-Qs CANopen stack, the 16-bit Delta-Q alarm/fault 
        // codes are stored in little - endian order in the EMCY message and big - endian order
        // in the 1003h object(see JIRA reference SSP - 4514).
        // Source here: file:///V:/Software/Releases/APP_1/v4.x.x/v4.3.8/smp_config.html#ind0_1003
        //
        // We can use this case to read faults in 1003 object
        case (FAULTS):
            var errorCode = "0x" + (bytesArray[1] + bytesArray[0] + bytesArray[3] + bytesArray[2]).toUpperCase();

            if ( Object.keys(alarmCodeToDescDictionary).length == 0 )
            {
                LoadAlarmIDToDes(alarmCodeToDescDictionary);    
            }
            
            if ( Object.keys(faultCodeToDescDictionary).length == 0 )
            {
                LoadFaultIDToDes(faultCodeToDescDictionary);    
            }
            
            if ( Object.keys(highPriorityAlarmCodeToDescDictionary).length == 0 )
            {
                LoadHighPriAlmIDToDes(highPriorityAlarmCodeToDescDictionary);    
            }
            
            
            
            //Alarm
            if (bytesArray[2] == '80') {
                var alarmNum = parseInt(bytesArray[3], 16);
                var desc = alarmCodeToDescDictionary[alarmNum.toString() + 'u'];
                if (desc == undefined)
                    desc = "Unknown alarm";
                result = 'E' + PadWithZeros(alarmNum.toString()) + ': ' + desc;
            }
            //Fault
            else if (bytesArray[2] == 'C0') {
                var faultNum = parseInt(bytesArray[3], 16);
                var desc = faultCodeToDescDictionary[faultNum.toString() + 'u'];
                if (desc == undefined)
                    desc = "Unknwon fault";
                result = 'F' + PadWithZeros(faultNum.toString()) + ': ' + desc;
            }
            //High priority alarm
            else if (bytesArray[2] == '00') {
                var alarmNum = parseInt(bytesArray[3], 16);
                var desc = highPriorityAlarmCodeToDescDictionary[alarmNum.toString() + 'u'];
                if (desc == undefined)
                    desc = "Unknown alarm";
                result = 'H' + PadWithZeros(alarmNum.toString()) + ': ' + desc;
            }
            else {
                result = errorCode + ": " + "Unknown faults or alarms format";
            }
            break;

            function PadWithZeros(errorCode) {
                while (errorCode.length < 3)
                    errorCode = '0' + errorCode
                return errorCode;
            }

        case (SERIAL_NUMBER_4):
            /*
             * Read: Encoded combination of the last 10 characters from the charger's serial number label. 
             * For example, if the charger's serial number label is DSQB481309100047 then the last 10 characters are 1309100047. 
             * The first two of these characters, 13, represent the year of manufacture. The next two characters are the week of manufacture. 
             * And the fifth character, 1,  is the location of manufacture. These are combined as ( 13 * 53 + 9 ) * 16 + 1 = 0x2BA1.
             * The remaining 5 characters are simply encoded as hexadecimal so 000047 = 0x002F. The entire value then is 0x2BA1002F. The value is stored as little-endian
             * 
             * In this case we need to decode the hex to serial number
             */
            var undecodedFirstFiveDecimal = parseInt(bytesArray[3] + bytesArray[2], 16);

            //Find location integer
            var location;
            for (var i = 0; i < 10; i++) {
                if ((undecodedFirstFiveDecimal - i) % 16 == 0) {
                    undecodedFirstFiveDecimal = (undecodedFirstFiveDecimal - i) / 16;
                    location = i;
                    break;
                }
            }
            if (location == undefined)
            {
                //throw "Invalid serial number";
                return "Invalid serial number";
            }
            
            //Find week integer
            var week;
            for (var i = 0; i < 53; i++) {
                if ((undecodedFirstFiveDecimal - i) % 53 == 0) {
                    undecodedFirstFiveDecimal = (undecodedFirstFiveDecimal - i) / 53;
                    week = i;
                    break;
                }
            }
            if (week == undefined)
            {
                // throw "Invalid serial number";
                return "Invalid serial number";
            }
                

            //Find year integer
            var year = undecodedFirstFiveDecimal;

            var decodedFirstFiveDecimal = PadZeros(year.toString(), 2) + PadZeros(week.toString(), 2) + location.toString();

            //Remaining 5 characters
            var lastFive = parseInt(bytesArray[1] + bytesArray[0], 16);

            //Result is the combination of first five and last five numbers
            result = decodedFirstFiveDecimal + PadZeros(lastFive.toString(), 5);
            break;

            function PadZeros(string, length) {
                while (string.length < length)
                    string = "0" + string;

                return string;
            }

        case (SERIAL_NUMBER_2):

            // First find the first 2 bits, 
            // if it starts with 00, use "new" method to decode
            // if it starts with 01, use "old" method to decode

            var binary = hex2bin(bytesArray[3]) + hex2bin(bytesArray[2]) + hex2bin(bytesArray[1]) + hex2bin(bytesArray[0]);

            if (parseInt(bytesArray[3].substring(0, 1), 16) < 3) {
                //NEW WAY
                /*
                 *   In the future, Delta-Q serial number labels will be of the format DSB48X1309100047. 
                 *   In this case, sub-index 2 will be based on five serial number characters (i.e., SB48X). Each character will be encoded as 6-bits instead of 8. The encoding is shown below
                 *   Character Binary Encoding
                 *   0 000000
                 *   1 000001
                 *   .
                 *   .
                 *   9 001001
                 *   A 001010
                 *   B 001011
                 *   .
                 *   .
                 *   Z 100011
                 *   - It's basically digits end up as their value (in 6 bits), and letters are the ASCII value of the character (in decimal) minus 55.
                 *   -This format will always start with "00" followed by 5 6-bit character encodings -> total 4 bytes
                 *   -This format will always start with letter "D", the letter "D" is not encoded.
                 *   -The value is also stored as little-endian.
                 */
                result = "D" + GetASCIICharFromBinary(binary.substring(2, 8)) +
                    GetASCIICharFromBinary(binary.substring(8, 14)) +
                    GetASCIICharFromBinary(binary.substring(14, 20)) +
                    GetASCIICharFromBinary(binary.substring(20, 26)) +
                    GetASCIICharFromBinary(binary.substring(26, 32)); 

                function GetASCIICharFromBinary(binary) {
                    var int = parseInt(binary, 2);
                    if (int < 10)
                        return int
                    else
                        return String.fromCharCode(int + 55);
                }
            }
            else {
                //OLD WAY
                /*
                 * ASCII character codes corresponding to the third through sixth characters of 
                 * the charger's serial number label. For example, if the charger's serial number 
                 * label reads DQSB481309100047 then this value will read 0x53423438 ("SB48"). 
                 * The value is stored as little-endian.
                 * This method will always start with "DQ", the letter "DQ" is not encoded
                 */
                result = "DQ" + String.fromCharCode(parseInt(binary.substring(24, 32), 2)) +
                    String.fromCharCode(parseInt(binary.substring(16, 24), 2)) +
                    String.fromCharCode(parseInt(binary.substring(8, 16), 2)) +
                    String.fromCharCode(parseInt(binary.substring(0, 8), 2));
            }

            break;

            function hex2bin(hex) {
                return ("00000000" + (parseInt(hex, 16)).toString(2)).substr(-8);
            }

        default:
            throw "type of " + "\"" + type + "\"" + "is undefined.";
    }

    return result;
}
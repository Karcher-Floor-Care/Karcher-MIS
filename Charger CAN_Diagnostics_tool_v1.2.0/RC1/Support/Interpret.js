var ASCII = "ascii";
var FLOAT32 = "float32";
var UINT32 = "uint32";
var UINT16 = "uint16";
var UINT32ARRAY = "uint32Array";
var PRIMITIVE = "primitive";
var BOOL = "bool";

var idTypes = {
    "ascii": ASCII,
    "0": ASCII,
    "1": ASCII,
    "4": FLOAT32,
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
    "25": PRIMITIVE,
    "27": PRIMITIVE,
    "67": PRIMITIVE,
    "71": ASCII,
    "75": UINT16,
    "77": UINT32,
    "86": BOOL,
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
    "297": FLOAT32,
    "309": FLOAT32,
    "350": UINT32,
    "365": UINT32ARRAY
}


function Interpret(id, rawBinary) {

    var type = idTypes[id];

    if (type == undefined || type == null) {
        throw "Type unknown for dsID: " + id;
    }

    var binaryArray = rawBinary.split(" ");

    if (binaryArray.length < 1) {
        throw "No value found in charger.";
    }

    switch (type) {
        case (ASCII):
            var result = "";
            for (var i = 0; i < binaryArray.length; i++) {
                if (Number(binaryArray[i], 16) != 0) {
                    result += String.fromCharCode(parseInt(binaryArray[i], 16));
                }
            }
            if (result === "") {
                throw "No value found in charger.";
            } else {
                return result;
            }

        case (FLOAT32):
            var data = new ArrayBuffer(4);
            for (var i = 0; i < binaryArray.length; i++) {
                data[i] = parseInt(binaryArray[i], 16)

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

            return num.toString();

        case (PRIMITIVE):
            var result = rawBinary;

            return result;

        case (UINT32):
            var hex = binaryArray[3] + binaryArray[2] + binaryArray[1] + binaryArray[0];
            var int = parseInt(hex, 16);

            return int;

        case (UINT16):
            var hex = binaryArray[1] + binaryArray[0];
            var int = parseInt(hex, 16);
            return int;

        case (UINT32ARRAY):

            var resultArray = [];

            if (binaryArray.length <= 4)
                throw "No value found in charger.";

            for (var i = 0; i + 3 < binaryArray.length; i += 4) {
                var hex = binaryArray[i + 3] + binaryArray[i + 2] + binaryArray[i + 1] + binaryArray[i + 0];
                var int = parseInt(hex, 16);
                resultArray.push(int);
            }

            return resultArray;

        case (BOOL):

            return (parseInt(rawBinary) == 1);

        default:
            throw "type of " + "\"" + type + "\"" + "is undefined.";
    }
}
/*global dcmUtils,rawData,dicom*/

// ejemplo de uso...
var dcmBytes = new Uint8Array(length);
// copiar el fichero dicom para su posterior modificación                
for (var j = 0; j < length; j++)
{
    dcmBytes[j] = rawData.charCodeAt(j);
}

var blob;
if (dcmUtils.isDicomFile(dcmBytes))
{
    blob = dicom.anonimize(dcmBytes);
} else {
    blob = new Blob([dcmBytes]);
}
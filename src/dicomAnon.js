/*! dicomAnon - v0.3 */

//Librería de tags a anonimizar @see tagsToAnon.js
var tagsInfo = tagsInfo || {};
//Métodos de anonimización
var anon = anon || {}; //@see tagsToAnon.js

var dcmUtils = {
    isDicomFile: function (dcmBytes)
    {
        //Header PREFIX, comprobar que el fichero es un DICOM
        //|D 68 | I 73 | C 67 | M 77 |

        return dcmBytes[128] === 'D'.charCodeAt(0) &&
                dcmBytes[129] === 'I'.charCodeAt(0) &&
                dcmBytes[130] === 'C'.charCodeAt(0) &&
                dcmBytes[131] === 'M'.charCodeAt(0);
    }
};

var dicom = (function ()
{
    'use strict';
    var _this = this;

    // fichero anonimizado
    var anonimiziedBlob;
    // fitxer original
    var srcBlob;

    /**
     * carga la información de las imágenes
     * {'tagName': 'x','tagCode': 'y','initPos': 't','endPos': 'w'};
     */
    var loadOffsets = function ()
    {
        try
        {
            /*global dicomParser, UNKNOWN*/
            // parsear el objecto copiado, contiene la información de los tags DICOM            
            var dataSet = dicomParser.parseDicom(srcBlob);

            // cs(dataSet.elements);           

            // extraer la posición de inicio(offset) donde se encuentra la información de cada tag y lo que ocupa(length)              
            // tagsInfo : diccionario de tags a anonimizar
            for (var k = 0, tagsLen = tagsInfo.length; k < tagsLen; k++)
            {
                // extraer cada tag de nuestro diccionario en el conjunto extraído de la imagen
                var elementOfDataSet = dataSet.elements[tagsInfo[k].tagCode];

                if (elementOfDataSet)
                {
                    //todo with switch
                    if (elementOfDataSet.vr === 'SQ')
                    {
                        tagsInfo[k].itemsDataSet = [];
                        // elementOfDataSet.items -> nativo de la librería ( array )
                        elementOfDataSet.items.forEach(function (item, index)
                        {
                            // podría contener nodos anidados, estos serán tratados posteriormente
                            tagsInfo[k].itemsDataSet.push(item.dataSet);
                        });
                    }
                    if (elementOfDataSet.vr === 'UI')
                    {
                        tagsInfo[k].anonMethod = anon.UI;
                    }

                    // limpiar la información previa
                    tagsInfo[k].offSet = null;
                    tagsInfo[k].offSet = elementOfDataSet.dataOffset;

                    tagsInfo[k].offSetEnd = null;
                    tagsInfo[k].offSetEnd = elementOfDataSet.dataOffset + elementOfDataSet.length;
                }
            }
        } catch (err)
        {
            // cs('Error parsing byte stream' - err);
        }
        //cs(tagsInfo);
    };

    var anonimizeBlob = function ()
    {
        var charFixed = '';

        // recorrer todos los tags
        for (var t = 0, tagsInfoLen = tagsInfo.length; t < tagsInfoLen; t++)
        {
            // filtrar posibles errores de lectura
            if (tagsInfo[t].offSet
                    && tagsInfo[t].offSetEnd
                    // filtro para dicom con TAGS con VR = SQ
                    && !tagsInfo[t].itemsDataSet)
            {
                // recorrer el fichero por el offset indicado para poder aplicar la anonimización
                // charIdx -> se usa para aquellos con un valor fijo
                // usamos un cache for
                // http://jsperf.com/browser-diet-jquery-each-vs-for-loop/78
                for (var n = tagsInfo[t].offSet, offSetEnd = tagsInfo[t].offSetEnd, charIdx = 0; n < offSetEnd; n++, charIdx++)
                {
                    // división por tipo de anonimización
                    switch (tagsInfo[t].anonMethod)
                    {
                        case anon.empty:
                            srcBlob[n] = 32; //space
                            break;

                        case anon.remove:
                            srcBlob[n] = null;
                            break;

                        case anon.fixed:
                            charFixed = tagsInfo[t].fixedVal.split('');
                            srcBlob[n] = charFixed[charIdx] ? charFixed[charIdx].charCodeAt(0) : null;
                            break;

                        case anon.unique:
                            srcBlob[n] = 42; //*
                            break;
                    }
                }

            } else if (tagsInfo[t].offSet
                    && tagsInfo[t].offSetEnd
                    && tagsInfo[t].itemsDataSet) {

                // cs(dataSet.elements['x00321064'].vr === 'SQ');                

                /* http://medical.nema.org/medical/dicom/current/output/html/part06.html#chapter_A                
                 * Implementers of the standard should be warned that old objects of the associated SOP 
                 * Classes exist and that they use this VR instead of "SQ". In particular, when reading objects with 
                 * Implicit VR Little Endian transfer syntax, this inconsistency might result in parsing 
                 * errors if not handled appropriately.
                 */

                // TAGS con VR = SQ
                // cs(tagsInfo[t].itemsDataSet);
                // itemsDataSet -> conjunto anidado en un element SQ
                tagsInfo[t].itemsDataSet.forEach(function (item, index)
                {
                    // cs(item);
                    var replaceElementData = function (pElement)
                    {
                        //tratamiento habitual
                        if (pElement.vr !== 'SQ')
                        {
                            var elemOffSet = pElement.dataOffset;
                            var elemOffSetEnd = elemOffSet + pElement.length;

                            for (var n = elemOffSet; n < elemOffSetEnd; n++)
                            {
                                srcBlob[n] = 42; //*
                            }
                        } else {

                            // cs(pElement);
                            // operación recursiva para buscar nodos anidados con VR = SQ 
                            if (pElement.hasOwnProperty('items')
                                    && pElement.items.length > 0)
                            {
                                pElement.items.forEach(function (item, index)
                                {
                                    for (var pElementKey in item.dataSet.elements)
                                    {
                                        var elementToAnonimize = item.dataSet.elements[pElementKey];

                                        replaceElementData(elementToAnonimize);
                                    }
                                });

                            } else {
                                // condición de salida
                                return 0;
                            }
                        }
                    };

                    // inicio operación recursiva para anonimizar items anidados
                    for (var elementKey in item.elements)
                    {
                        if (item.elements.hasOwnProperty(elementKey))
                        {
                            var elementToAnonimize = item.elements[elementKey];

                            replaceElementData(elementToAnonimize);
                        }
                    }
                });
            }
        }

        anonimiziedBlob = new Blob([srcBlob], {type: 'application/dicom'});
    };

    return {
        /**
         * @param {Uint8Array} bytesToAnon
         * @returns {blob} fichero anonimizado
         */
        anonimize: function (bytesToAnon) {        

            //cs(blobToAnon);            
            srcBlob = bytesToAnon;
            loadOffsets();
            anonimizeBlob();

            return anonimiziedBlob;
        }
    };
}());
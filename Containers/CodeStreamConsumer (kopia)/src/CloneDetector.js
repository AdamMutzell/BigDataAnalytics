const emptyLine = /^\s*$/;
const oneLineComment = /\/\/.*/;
const oneLineMultiLineComment = /\/\*.*?\*\//; 
const openMultiLineComment = /\/\*/;
const closeMultiLineComment = /\*\//;

const SourceLine = require('./SourceLine');
const FileStorage = require('./FileStorage');
const Clone = require('./Clone');

const DEFAULT_CHUNKSIZE=5;

class CloneDetector {
    #myChunkSize = process.env.CHUNKSIZE || DEFAULT_CHUNKSIZE;
    #myFileStore = FileStorage.getInstance();

    constructor() {
    }

    // Private Methods
    // --------------------
    #filterLines(file) {
        let lines = file.contents.split('\n');
        let inMultiLineComment = false;
        file.lines=[];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // First, handle one-line multi-line comments
            line = line.replace(oneLineMultiLineComment, '');

            // Check if we're entering a multi-line comment
            if (line.search(openMultiLineComment) !== -1) {
                // Check if it closes on the same line (already handled above)
                if (line.search(closeMultiLineComment) === -1) {
                    line = line.substring(0, line.indexOf('/*'));
                    inMultiLineComment = true;
                }
            }

            // If we're in a multi-line comment
            if (inMultiLineComment) {
                if (line.search(closeMultiLineComment) !== -1) {
                    // Found the closing */, take everything after it
                    line = line.substring(line.indexOf('*/') + 2);
                    inMultiLineComment = false;
                } else {
                    // Still in comment, skip this line entirely
                    line = '';
                }
            }

            // Clean up remaining patterns
            line = line.replace(oneLineComment, '');
            line = line.replace(emptyLine, '');

            file.lines.push(new SourceLine(i+1, line.trim()));
        }
       
        return file;
    }

    #getContentLines(file) {
        return file.lines.filter( line => line.hasContent() );        
    }


    #chunkify(file) {
        let chunkSize = this.#myChunkSize;
        let lines = this.#getContentLines(file);
        file.chunks=[];

        for (let i = 0; i <= lines.length-chunkSize; i++) {
            let chunk = lines.slice(i, i+chunkSize);
            file.chunks.push(chunk);
        }
        return file;
    }
    
    #chunkMatch(first, second) { 
        // This function was a little bad performance-wise, so I rewrote it.
        if (first.length != second.length) return false;
        for (let idx=0; idx < first.length; idx++) {
            if (!first[idx].equals(second[idx])) return false;
        }
        return true;
    }

    #filterCloneCandidates(file, compareFile) {
        // TODO
        // For each chunk in file.chunks, find all #chunkMatch() in compareFile.chunks
        // For each matching chunk, create a new Clone.
        // Store the resulting (flat) array in file.instances.
        // 
        // TIP 1: Array.filter to find a set of matches, Array.map to return a new array with modified objects.
        // TIP 2: You can daisy-chain calls to filter().map().filter().flat() etc.
        // TIP 3: Remember that file.instances may have already been created, so only append to it.
        //
        // Return: file, including file.instances which is an array of Clone objects (or an empty array).
        //

        // Implementation:
        // For each chunk in compareFile, find all matching chunks in file. 
        // This is swapped due to a problem arising in the test files
        // There is a scenario where the filterCloneCandidates creates alternating clones due to the compare file having multiple clones.
        // This causes the expansion to fail,as clones from other pieces of the compareFile could combine with another existing clone.
        // By swapping the order, we ensure that all clones from the compareFile are found in one go, and then expanded properly.
       
        let newInstances = compareFile.chunks.map( (compareChunk, index) => {
        
            let matches = file.chunks
                .map( (chunk, compareIndex) => {
                    if (this.#chunkMatch(chunk, compareChunk)) {
                        return new Clone(
                            file.name, 
                            compareFile.name,
                            chunk,
                            compareChunk
                        );
                    } else {
                        return null;
                    }
                })
                .filter( match => match != null );
            return matches;
        }).flat();
        file.instances = file.instances || [];
        file.instances = file.instances.concat(newInstances);
        return file;
    }
     
    #expandCloneCandidates(file) {
        // TODO
        // For each Clone in file.instances, try to expand it with every other Clone
        // (using Clone::maybeExpandWith(), which returns true if it could expand)
        // 
        // Comment: This should be doable with a reduce:
        //          For every new element, check if it overlaps any element in the accumulator.
        //          If it does, expand the element in the accumulator. If it doesn't, add it to the accumulator.
        //
        // ASSUME: As long as you traverse the array file.instances in the "normal" order, only forward expansion is necessary.
        // 
        // Return: file, with file.instances only including Clones that have been expanded as much as they can,
        //         and not any of the Clones used during that expansion.
        // arasr

        let expandedInstances = file.instances.reduce( (accumulator, current) => {
            let expanded = false;
            for (let i = 0; i < accumulator.length; i++) {
                let existing = accumulator[accumulator.length-1-i]; // check most recently added first, as they are more likely to be expandable
                if (existing.maybeExpandWith(current)) {
                    expanded = true;
                    break;
                }
            }
            if (!expanded) {
                accumulator.push(current);
            }
            return accumulator;
        }, []);
        file.instances = expandedInstances;
      
        return file;
    }
    
    #consolidateClones(file) {
        // TODO
        // For each clone, accumulate it into an array if it is new
        // If it isn't new, update the existing clone to include this one too
        // using Clone::addTarget()
        // 
        // TIP 1: Array.reduce() with an empty array as start value.
        //        Push not-seen-before clones into the accumulator
        // TIP 2: There should only be one match in the accumulator
        //        so Array.find() and Clone::equals() will do nicely.
        //
        // Return: file, with file.instances containing unique Clone objects that may contain several targets
        //
        let consolidatedInstances = file.instances.reduce( (accumulator, current) => {
            let existing = accumulator.find( clone => clone.equals(current) );
            if (existing) {
                existing.addTarget(current);
            } else {
                accumulator.push(current);
            }
            return accumulator;
        }, []);
        file.instances = consolidatedInstances;

        return file;
    }
    

    // Public Processing Steps
    // --------------------
    preprocess(file) {
        return new Promise( (resolve, reject) => {
            if (!file.name.endsWith('.java') ) {
                reject(file.name + ' is not a java file. Discarding.');
            } else if(this.#myFileStore.isFileProcessed(file.name)) {
                reject(file.name + ' has already been processed.');
            } else {
                resolve(file);
            }
        });
    }

    transform(file) {
        file = this.#filterLines(file);
        file = this.#chunkify(file);
        return file;
    }

    matchDetect(file) {
        let allFiles = this.#myFileStore.getAllFiles();
        file.instances = file.instances || [];
        for (let f of allFiles) {
            // TODO implement these methods (or re-write the function matchDetect() to your own liking)
            // 
            // Overall process:
            // 
            // 1. Find all equal chunks in file and f. Represent each matching pair as a Clone.
            //
            // 2. For each Clone with endLine=x, merge it with Clone with endLine-1=x
            //    remove the now redundant clone, rinse & repeat.
            //    note that you may end up with several "root" Clones for each processed file f
            //    if there are more than one clone between the file f and the current
            //
            // 3. If the same clone is found in several places, consolidate them into one Clone.
            //
            file = this.#filterCloneCandidates(file, f); 
            file = this.#expandCloneCandidates(file);
            file = this.#consolidateClones(file); 
        }

        return file;
    }

    pruneFile(file) {
        delete file.lines;
        delete file.instances;
        return file;
    }
    
    storeFile(file) {
        this.#myFileStore.storeFile(this.pruneFile(file));
        return file;
    }

    get numberOfProcessedFiles() { return this.#myFileStore.numberOfFiles; }
}

module.exports = CloneDetector;

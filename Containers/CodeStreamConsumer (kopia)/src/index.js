const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');


// Express and Formidable stuff to receice a file for further processing
// --------------------
const form = formidable({multiples:false});

app.post('/', fileReceiver );
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        if (files.data === undefined) {
            res.status(400);
            return res.end('No file uploaded');
        }
        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then( data => { return processFile(fields.name, data); });
    });
    return res.end('');
}

app.get('/', viewClones );
app.get('/timers', viewStats );

const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });


// Page generation for viewing current progress
// --------------------
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = 'Processed ' + fileStore.numberOfFiles + ' files containing ' + cloneStore.numberOfClones + ' clones.'
    return output;
}

function plotTimeDiagram() {
    // TODO implement a time diagram of processing times
    let output = '<p>Processing times (in µs):</p>\n<ul>\n'
    let fileStore = FileStorage.getInstance();
    let numberOfFiles = BigInt(fileStore.numberOfFiles);
    
    output += '<li>Number of files: ' + numberOfFiles + '\n';
    output += '<li>Average per file: ' + (totalProcessingTime / numberOfFiles) / (1000n) + ' µs\n'
    output += '<li>Average time for the last 100 files: ' + (allProcessingTimesAndLines.slice(-100).reduce( (a,t) => a + t.time, 0n) / 100n) / (1000n) + ' µs\n'
    output += '<li>Average time for the last 1000 files: ' + (allProcessingTimesAndLines.slice(-1000).reduce( (a,t) => a + t.time, 0n) / 1000n) / (1000n) + ' µs\n'
    output += '<li>Max: ' + (maxProcessingTime / (1000n)) + ' µs\n'
    output += '<li>Min: ' + (minProcessingTime / (1000n)) + ' µs\n'
    output += '</ul>\n';
    output += '<p>All processing times (in µs):</p>\n<ul>\n'

    // 1. Add the Chart.js script
    let script = 'https://cdn.jsdelivr.net/npm/chart.js';
    output += `<script src="${script}"></script>\n`;
    
    // 2. Add a canvas element to the HTML where the chart will be rendered
    output += '<canvas id="timeChart" width="400" height="200"></canvas>\n';
    output += '<script>\n';

    // 3. Add JavaScript code to create and configure the chart
    output += `
    const ctx = document.getElementById('timeChart').getContext('2d');
    const timeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [${allProcessingTimesAndLines.map((_, index) => index + 1).join(',')}],
            datasets: [{
                label: 'Processing Time (µs)',
                data: [${allProcessingTimesAndLines.map(t => (t.time / 1000n).toString()).join(',')}],
                borderColor: 'rgba(45, 201, 201, 1)',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                yAxisID: 'y'
            },
            {         
                label: 'Normalized by Lines (µs/line)',
                data: [${allProcessingTimesAndLines.map(t => t.time / BigInt(t.lines) / 1000n).join(',')}],
                borderColor: 'rgba(138, 86, 240, 1)',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                yAxisID: 'y1'
            }]
        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'File Index'
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Processing Time (µs)'
                    },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Time per Line (µs/line)'
                    },
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
    `;
    output += '</script>\n';

    output += '</ul>\n';
    return output;
}
function lastFileTimersHTML() {
    if (!lastFile) return '';
    output = '<p>Timers for last file processed:</p>\n<ul>\n'
    let timers = Timer.getTimers(lastFile);
    for (t in timers) {
        output += '<li>' + t + ': ' + (timers[t] / (1000n)) + ' µs\n'
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach( clone => {
        output += '<hr>\n';
        output += '<h2>Source File: ' + clone.sourceName + '</h2>\n';
        output += '<p>Starting at line: ' + clone.sourceStart + ' , ending at line: ' + clone.sourceEnd + '</p>\n';
        output += '<ul>';
        clone.targets.forEach( target => {
            output += '<li>Found in ' + target.name + ' starting at line ' + target.startLine + '\n';            
        });
        output += '</ul>\n'
        output += '<h3>Contents:</h3>\n<pre><code>\n';
        output += clone.originalCode;
        output += '</code></pre>\n';
    });

    return output;
}

function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<HR>\n<H2>Processed Files</H2>\n'
    output += fs.filenames.reduce( (out, name) => {
        out += '<li>' + name + '\n';
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page='<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector</H1>\n';
    page += '<P>' + getStatistics() + '</P>\n';
    page += lastFileTimersHTML() + '\n';
    page += listClonesHTML() + '\n';
    page += listProcessedFilesHTML() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}

function viewStats(req, res, next) {
    let page='<HTML><HEAD><TITLE>CodeStream Clone Detector - Statistics</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector - Statistics</H1>\n';
    page += '<P>' + getStatistics() + '</P>\n';
    page += plotTimeDiagram() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}
// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};

const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
var lastFile = null;
var numberOfProcessedFiles = 0;
var totalProcessingTime = 0n;
var allProcessingTimes = [];
var allProcessingTimesAndLines = [];
var maxProcessingTime = 0n;
var minProcessingTime = 0n;

function maybePrintStatistics(file, cloneDetector, cloneStore) {
    if (0 == cloneDetector.numberOfProcessedFiles % STATS_FREQ) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        let timers = Timer.getTimers(file);
        let str = 'Timers for last file processed: ';
        for (t in timers) {
            str += t + ': ' + (timers[t] / (1000n)) + ' µs '
        }
        console.log(str);
        console.log('List of found clones available at', URL);
    }

    return file;
}

// Processing of the file
// --------------------
function processFile(filename, contents) {
    let cd = new CloneDetector();
    let cloneStore = CloneStorage.getInstance();

    return Promise.resolve({name: filename, contents: contents} )
        //.then( PASS( (file) => console.log('Processing file:', file.name) ))
        .then( (file) => Timer.startTimer(file, 'total') )
        .then( (file) => cd.preprocess(file) )
        .then( (file) => cd.transform(file) )

        .then( (file) => Timer.startTimer(file, 'match') )
        .then( (file) => cd.matchDetect(file) )
        .then( (file) => cloneStore.storeClones(file) )
        .then( (file) => Timer.endTimer(file, 'match') )

        .then( (file) => cd.storeFile(file) )
        .then( (file) => Timer.endTimer(file, 'total') )
        .then( PASS( (file) => lastFile = file ))
        .then( PASS( (file) => {
            let t = Timer.getTimers(file).total;

            totalProcessingTime += t;
            if (maxProcessingTime == 0n || t > maxProcessingTime) maxProcessingTime = t;
            if (minProcessingTime == 0n || t < minProcessingTime) minProcessingTime = t;
            allProcessingTimesAndLines.push( { time: t, lines: file.contents.split('\n').length } );

        }))
        .then( PASS( (file) => maybePrintStatistics(file, cd, cloneStore) ))
    // TODO Store the timers from every file (or every 10th file), create a new landing page /timers
    // and display more in depth statistics there. Examples include:
    // average times per file, average times per last 100 files, last 1000 files.
    // Perhaps throw in a graph over all files.
        .catch( console.log );
};

/*
1. Preprocessing: Remove uninteresting code, determine source and comparison units/granularities
2. Transformation: One or more extraction and/or transformation techniques are applied to the preprocessed code to obtain an intermediate representation of the code.
3. Match Detection: Transformed units (and/or metrics for those units) are compared to find similar source units.
4. Formatting: Locations of identified clones in the transformed units are mapped to the original code base by file location and line number.
5. Post-Processing and Filtering: Visualisation of clones and manual analysis to filter out false positives
6. Aggregation: Clone pairs are aggregated to form clone classes or families, in order to reduce the amount of data and facilitate analysis.
*/

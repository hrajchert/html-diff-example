#!/usr/bin/env node

import { readFile } from '@ts-task/fs';
import { Task } from '@ts-task/task';
import { JSDOM } from 'jsdom';

const originalElementId = 'make-everything-ok-button';
// org ./files/sample-0-origin.html
// cmp ./files/sample-1-evil-gemini.html

// Execute the program when the module is required
main();

function usage () {
    console.error('Invalid call');
    console.error('node dist/index.js <origin> <cmp>');
    process.exit(1);
}

// Helper to check the file is defined
function fileUndefined (file: string | undefined) {
    return typeof file === 'undefined' || file === '';
}

function createClassNameHeuristics (element: HTMLElement) {
    const query = `a[class="${element.className}"]`;

    return function (document: Document) {
        return document.querySelector(query);
    };
}

function createTitleHeuristics (element: HTMLElement) {
    const query = `a[title="${element.title}"]`;

    return function (document: Document) {
        return document.querySelector(query);
    };

}

class OriginalElementNotFound {
    constructor (private id: string) {

    }

    explain () {
        return `The element ${this.id} was not found in the original document`;
    }
}

// Creates an array of functions to search in a document
function createHeuristics (html: JSDOM) {
    const { document } = html.window;

    // Find the element to base the search
    const element = document.getElementById(originalElementId);
    if (element) {
        return Task.resolve([
            createClassNameHeuristics(element),
            createTitleHeuristics(element)
        ]);

    } else {
        return Task.reject(new OriginalElementNotFound(originalElementId));
    }
}

type Heuristic = (doc: Document) => Element | null;

function resolveHeuristics (heuristics: Heuristic[], html: JSDOM) {
    const { document } = html.window;
    let ans: Element | null = null;

    // Run all heuristics until we get a match (or we dont find one)
    for (let i = 0; i < heuristics.length && ans === null ; i++) {
        ans = heuristics[i](document);
    }

    return ans;
}


// Generate a XPath from an element
function getNodePath (element: Element | null) {
    // If the element was not found, dont return a path
    if (!element) return null;
    const xpath: string[] = [];

    function getNodeName (e: Element) {
        return e.tagName.toLowerCase();
    }

    // Recursive function that fills the xpath in reverse order
    function traverseNodes (e: Element | null) {
        if (!e) return;
        xpath.push(getNodeName(e));
        traverseNodes(e.parentElement);
    }

    // Traverse starting from the found element
    traverseNodes(element);

    return xpath.reverse();
}

function readFileAsHTML (file: string) {
    return readFile(file, {encoding: 'utf8'})
            .map(html => new JSDOM(html));
}

function joinXPath (nodes: string[]) {
    return nodes.join(' > ');
}
function main () {
    // Proccess the console arguments, they are in this order
    // [node, index.js, org, cmp]
    const [_, __, originFile, cmpFile] = process.argv;

    // If they are not correct finish the program
    if (fileUndefined(originFile) || fileUndefined(cmpFile)) {
        usage();
    }

    Task.all([
        readFileAsHTML(originFile).chain(createHeuristics),
        readFileAsHTML(cmpFile)
    ])
        .map(([heuristics, newDoc]) => resolveHeuristics(heuristics, newDoc))
        .map(getNodePath)
        .fork(
            err => console.error('Something failed', err),
            xpath => {
                if (!xpath) {
                    console.error('The element was not found in the new document');
                } else {

                    console.log(`Element was found with this path: ${joinXPath(xpath)}` );
                }
            }
        );
}


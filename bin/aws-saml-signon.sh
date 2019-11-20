#!/bin/bash
cd $(dirname -- "$(readlink -f -- "$BASH_SOURCE")")/..
./node_modules/.bin/electron dist/main.js $@
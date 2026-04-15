SHELL := /bin/bash

ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
SCRIPTS := $(ROOT)scripts

.PHONY: render watch archive

render:
	@bash "$(SCRIPTS)/render-diagram.sh"

watch:
	@bash "$(SCRIPTS)/watch-diagram.sh"

archive:
	@bash "$(SCRIPTS)/archive-diagram.sh"

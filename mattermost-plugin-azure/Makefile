PLUGIN_ID ?= com.azurefastboard.ado
PLUGIN_VERSION ?= 0.1.0
BUNDLE = dist/$(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz

.PHONY: all build bundle clean check

all: bundle

check:
	@command -v go >/dev/null || (echo "Install Go 1.22+ from https://go.dev/dl/" && exit 1)

build: check
	mkdir -p server/dist
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/plugin-linux-amd64 .
	cd server && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o dist/plugin-linux-arm64 .
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -o dist/plugin-darwin-amd64 .
	cd server && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o dist/plugin-darwin-arm64 .
	cd server && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o dist/plugin-windows-amd64.exe .

bundle: build
	mkdir -p dist
	rm -f $(BUNDLE)
	tar -czf $(BUNDLE) plugin.json server/dist
	@echo "Built $(BUNDLE)"

clean:
	rm -rf server/dist dist

# Faster local iterate: current OS only
build-local: check
	mkdir -p server/dist
	cd server && go build -o dist/plugin-local .

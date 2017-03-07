# Plaid Demo

## Instructions

1. Clone this repo:
	```shell
	git clone git@github.com:F1LT3R/plaid-demo.git
	```
1. Cd into the repo directory:
	```
	cd plaid-demo
	```
1. Install the node packages:
	```shell
	npm install
	```
1. Export your plaid  `client_id` and `secret` as environment variables:
	> Your Client ID & Secret can be found here: [https://dashboard.plaid.com/overview](https://dashboard.plaid.com/overview)

	```shell
	export plaid_client_id="<your id>"
	export plaid_secret="<your secret>"
	```
1. Copy the data file:
	```shell
	cp WARNING_BANK_ACCESS_KEYS.template.json WARNING_BANK_ACCESS_KEYS.json
	```
1. Run the demo:
	```shell
	node plaid-demo.js
	```
'use strict';

const utils = require('@iobroker/adapter-core');
const puppeteer = require('puppeteer');

class Techem extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'techem',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));

		this.reg_heating = new RegExp('data-test-id="consumption-heating-current-amount-amount-with-unit">([0-9]+)<');
		this.reg_water = new RegExp('data-test-id="consumption-hot_water-current-amount-amount-with-unit">([0-9]+)<');
		this.poller;
	}

	async pollData() {
		// Create a new browser
		const browser = await puppeteer.launch({headless: true});
		const page = await browser.newPage();
		await page.setViewport({ width: 1920, height: 1080 });

		// goto homepage
		await page.goto('https://mieter.techem.de/', { waitUntil: ['networkidle2'] });

		// goto login page
		await page.click('[data-test-id="cta-global-header-login"]');
		await page.waitForNavigation({ waitUntil: ['networkidle2'] });

		//login
		await page.type('input[id="signInName"]', this.config.login);
		await page.type('input[id="password"]', this.config.password);
		await page.click('button[id="next"]');
		await page.waitForNavigation({ waitUntil: ['networkidle2'] });

		// parse data
		const data = await page.content();
		const water = data.match(this.reg_water);
		const heating = data.match(this.reg_heating);

		// create states if not exist
		await this.setObjectNotExistsAsync('Verbrauch_Heizung', {
			type: 'state',
			common: {
				name: 'Verbrauch Heizung',
				write: false,
				read: true,
				type: 'number',
				role: 'state',
				unit: 'kWh'
			},
			native: {},
		});
		await this.setObjectNotExistsAsync('Verbrauch_Warmwasser', {
			type: 'state',
			common: {
				name: 'Verbrauch Warmwasser',
				write: false,
				read: true,
				type: 'number',
				role: 'state',
				unit: 'kWh'
			},
			native: {},
		});

		// Write states
		if (water != null && water[1] != null) {
			await this.setStateAsync('Verbrauch_Warmwasser', { val: water[1], ack: true });
		}
		if (heating != null && heating[1] != null) {
			await this.setStateAsync('Verbrauch_Heizung', { val: heating[1], ack: true });
		}
		await browser.close();
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.poller = setInterval(this.pollData.bind(this), this.config.interval * 60000);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearInterval(this.poller);
			callback();
		} catch (e) {
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Techem(options);
} else {
	// otherwise start the instance directly
	new Techem();
}

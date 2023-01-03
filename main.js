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
		this.cookiebanner = new RegExp('a[id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection"]');
		this.homepage = 'https://mieter.techem.de/';
		this.poller;
		this.counter = 0;
	}

	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async pollData() {
		// Create a new browser
		this.log.info('Starting a new browser');
		let page;
		let browser;
		try {
			browser = await puppeteer.launch({headless: true});
			page = await browser.newPage();
			await page.setViewport({ width: 1920, height: 1080 });
		} catch (err) {
			this.log.error(`Could not start new Browser instance: ${err}`);
			return;
		}

		// goto homepage
		this.log.info(`Goto Page ${this.homepage}`);
		try {
			await page.goto(this.homepage, { waitUntil: ['networkidle2'] });
		} catch (err) {
			this.log.error(`Error opening page ${this.homepage}`);
			return;
		}

		// Click Cookie banner
		this.log.info('Checking for Cookie banner...');
		const checkdata = await page.content();
		const cookie = checkdata.match(this.cookiebanner);
		if (cookie && cookie[1]) {
			this.log.info('Cookie banner found, tryint to accept cookies');
			try {
				await page.click('a[id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection"]');
				await this.sleep(500);
			} catch (err) {
				this.log.error('Failed accepting Cookies');
			}
		} else {
			this.log.info('No Cookie banner found, continuing');
		}

		// goto login page
		this.log.info('Going to login page');
		try {
			await page.click('[data-test-id="cta-global-header-login"]');
			await page.waitForNavigation({ waitUntil: ['networkidle2'] });
		} catch (err) {
			this.log.error('Unable to go to login page...');
			return;
		}

		//login
		this.log.info('Entering login credentials and logging in');
		try {
			await page.type('input[id="signInName"]', this.config.login);
			await page.type('input[id="password"]', this.config.password);
			await page.click('button[id="next"]');
			await page.waitForNavigation({ waitUntil: ['networkidle2'] });
		} catch (err) {
			this.log.error('Unable to log in');
			return;
		}

		// parse data
		this.log.info('Trying to parse html for desired values');
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
		} else {
			this.log.warn('Could not extract data for warm water');
		}
		if (heating != null && heating[1] != null) {
			await this.setStateAsync('Verbrauch_Heizung', { val: heating[1], ack: true });
		} else {
			this.log.warn('Could not extract data for heating');
		}
		await browser.close();
	}

	checkPoll() {
		this.setState("info.connection", { val: true, ack: true });
		if (this.counter >= this.config.interval * 60) {
			this.pollData();
			this.counter = 0;
		} else {
			this.counter = this.counter + 1;
		}
			
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.setState("info.connection", { val: true, ack: true });
		this.pollData();
		// this.poller = setInterval(this.pollData.bind(this), this.config.interval * 60000);
		this.poller = setInterval(this.checkPoll.bind(this), 1000);
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

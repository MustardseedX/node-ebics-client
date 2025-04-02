'use strict';

const crypto = require('crypto');
const NodeRSA = require('node-rsa');

const BigNumber = require('./BigNumber.js');
const mgf1 = require('./MGF1');

const modPow = (base, power, mod) => {
	let result = new BigNumber(1);

	while (power > 0) {
		result = power.and(new BigNumber(1)) == 1 ? (result.mul(base)).mod(mod) : result; // eslint-disable-line
		base = (base.mul(base)).mod(mod);
		power = power.shrn(1);
	}
	return result;
};

const emsaPSS = (msg, salt) => {
	const eightNullBytes = Buffer.from('\x00'.repeat(8));
	const digestedMsg = crypto.createHash('sha256').update(msg).digest();
	const mTickHash = crypto.createHash('sha256').update(Buffer.concat([eightNullBytes, digestedMsg, salt]), 'binary').digest();

	const ps = Buffer.from('\x00'.repeat(190));
	const db = Buffer.concat([ps, Buffer.from('\x01'), salt]);

	const dbMask = mgf1.generate(mTickHash, db.length);
	const maskedDb = mgf1.xor(db, dbMask);

	let maskedDbMsb = mgf1.rjust(new BigNumber(maskedDb.slice(0, 1)).toString(2), 8, '0');


	maskedDbMsb = `0${maskedDbMsb.substr(1)}`;
	// console.log((new BN(maskedDbMsb, 2).toBuffer())[0], new BigNumber(maskedDbMsb, 2).toBuffer()[0]);
	// maskedDb[0] = (new BN(maskedDbMsb, 2).toBuffer())[0]; // eslint-disable-line
	maskedDb[0] = new BigNumber(maskedDbMsb, 2).toBEBuffer()[0]; // eslint-disable-line

	return Buffer.concat([maskedDb, mTickHash, Buffer.from('BC', 'hex')]);
};


module.exports = class Crypto {
	static digestPublicKey(key) {
		const str = [key.e('hex').replace(/^(0+)/g, ''), key.n('hex').replace(/^(0+)/g, '')].map(x => x.toLowerCase()).join(' ');

		return crypto.createHash('sha256').update(str).digest('base64').trim();
	}

	static publicEncrypt(key, data) {
		return crypto.publicEncrypt({
			key: key.toPem(),
			padding: crypto.constants.RSA_PKCS1_PADDING,
		}, data);
	}

	static privateDecrypt(key, data) {
		const keyRSA = new NodeRSA(
			key.toPem(),
			'pkcs1-private-pem', {
				encryptionScheme: 'pkcs1',
				environment: 'browser', // would use the crypto module by default, which blocks pkcs1
			},
		);
		return keyRSA.decrypt(data);
	}

	static privateSign(key, data, outputEncoding = 'base64') {
		const signer = crypto.createSign('SHA256');

		return signer.update(data).sign(key.toPem(), outputEncoding);
	}

	static sign(key, msg, salt = crypto.randomBytes(32)) {
		const base = new BigNumber(emsaPSS(msg, salt));
		const power = new BigNumber(key.d());
		const mod = new BigNumber(key.n());
		const buffer = modPow(base, power, mod).toBEBuffer();

		if (buffer.byteLength === 257 && buffer[0] === 0x00)
			return buffer.slice(1).toString('base64');

		return buffer.toString('base64');
	}

	static pad(d) {
		const dLen = d.length;
		const len = 16 * (Math.trunc(dLen / 16) + 1);

		return Buffer.concat([d, Buffer.from(Buffer.from([0]).toString().repeat(len - dLen - 1)), Buffer.from([len - dLen])]);
	}

	static digestWithHash(data, algorith = 'sha256') {
		return crypto.createHash(algorith).update(data).digest();
	}

	static nonce(outputEncoding = 'hex') {
		return crypto.randomBytes(16).toString(outputEncoding);
	}

	static timestamp() {
		return new Date().toISOString();
	}
};

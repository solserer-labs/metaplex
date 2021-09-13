#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { program } from 'commander';
import * as anchor from '@project-serum/anchor';
import BN from 'bn.js';
<<<<<<< HEAD
import { MintLayout, Token } from '@solana/spl-token';
import {signAllMetadataFromCandyMachine} from './signer'
import {
  chunks,
  fromUTF8Array,
  loadCache,
  parsePrice,
  saveCache,
  upload,
  updateCandyMachineList,
  getCandyMachineList
} from './helpers/various';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction } from './helpers/instructions';
import {
  CACHE_PATH,
  CONFIG_ARRAY_START,
  CONFIG_LINE_SIZE,
  EXTENSION_JSON,
  EXTENSION_PNG,
  PAYMENT_WALLET,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from './helpers/constants';
import { sendTransactionWithRetryWithKeypair } from './helpers/transactions';
import {
  createConfig,
  getCandyMachineAddress,
  getMasterEdition,
  getMetadata,
  getTokenWallet,
  loadAnchorProgram,
  loadWalletKey,
} from './helpers/accounts';
=======

import { fromUTF8Array, parsePrice } from './helpers/various';
import { PublicKey } from '@solana/web3.js';
import { CACHE_PATH, CONFIG_ARRAY_START, CONFIG_LINE_SIZE, EXTENSION_JSON, EXTENSION_PNG, } from './helpers/constants';
import { getCandyMachineAddress, loadAnchorProgram, loadWalletKey, } from './helpers/accounts';
>>>>>>> master
import { Config } from './types';
import { upload } from './commands/upload';
import { loadCache, saveCache } from './helpers/cache';
import { mint } from "./commands/mint";
import { signAllUnapprovedMetadata, signMetadata } from "./commands/sign";
import log from 'loglevel';

program.version('0.0.1');

if (!fs.existsSync(CACHE_PATH)) {
  fs.mkdirSync(CACHE_PATH);
}

log.setLevel(log.levels.INFO);

programCommand('upload')
  .argument(
    '<directory>',
    'Directory containing images named from 0-n',
    val => {
      return fs.readdirSync(`${val}`).map(file => path.join(val, file));
    },
  )
  .option('-n, --number <number>', 'Number of images to upload')
  .action(async (files: string[], options, cmd) => {
    const {number, keypair, env, cacheName} = cmd.opts();
    const parsedNumber = parseInt(number);

    const pngFileCount = files.filter(it => {
      return it.endsWith(EXTENSION_PNG);
    }).length;
    const jsonFileCount = files.filter(it => {
      return it.endsWith(EXTENSION_JSON);
    }).length;

    if (pngFileCount !== jsonFileCount) {
      throw new Error(`number of png files (${pngFileCount}) is different than the number of json files (${jsonFileCount})`);
    }

    if (parsedNumber < pngFileCount) {
      throw new Error(`max number (${parsedNumber})cannot be smaller than the number of elements in the source folder (${pngFileCount})`);
    }

    const startMs = Date.now();
    log.info("started at: " + startMs.toString())
    for (; ;) {
      const successful = await upload(files, cacheName, env, keypair, parsedNumber);
      if (successful) {
        break;
      } else {
        log.warn("upload was not successful, rerunning");
      }
    }
    const endMs = Date.now();
    const timeTaken = new Date(endMs - startMs).toISOString().substr(11, 8);
    log.info(`ended at: ${new Date(endMs).toString()}. time taken: ${timeTaken}`)

  });

programCommand('verify')
  .action(async (directory, cmd) => {
    const { env, keypair, cacheName } = cmd.opts();

    const cacheContent = loadCache(cacheName, env);
    const walletKeyPair = loadWalletKey(keypair);
    const anchorProgram = await loadAnchorProgram(walletKeyPair, env);

    const configAddress = new PublicKey(cacheContent.program.config);
    const config = await anchorProgram.provider.connection.getAccountInfo(
      configAddress,
    );
    let allGood = true;

    const keys = Object.keys(cacheContent.items);
    for (let i = 0; i < keys.length; i++) {
      log.debug('Looking at key ', i);
      const key = keys[i];
      const thisSlice = config.data.slice(
        CONFIG_ARRAY_START + 4 + CONFIG_LINE_SIZE * i,
        CONFIG_ARRAY_START + 4 + CONFIG_LINE_SIZE * (i + 1),
      );
      const name = fromUTF8Array([...thisSlice.slice(4, 36)]);
      const uri = fromUTF8Array([...thisSlice.slice(40, 240)]);
      const cacheItem = cacheContent.items[key];
      if (!name.match(cacheItem.name) || !uri.match(cacheItem.link)) {
        //leaving here for debugging reasons, but it's pretty useless. if the first upload fails - all others are wrong
        // console.log(
        //   `Name (${name}) or uri (${uri}) didnt match cache values of (${cacheItem.name})` +
        //   `and (${cacheItem.link}). marking to rerun for image`,
        //   key,
        // );
        cacheItem.onChain = false;
        allGood = false;
      } else {
        log.debug('Name', name, 'with', uri, 'checked out');
      }
    }

    if (!allGood) {
      saveCache(cacheName, env, cacheContent);

      throw new Error(
        `not all NFTs checked out. check out logs above for details`,
      );
    }

    const configData = (await anchorProgram.account.config.fetch(
      configAddress,
    )) as Config;

    const lineCount = new BN(config.data.slice(247, 247 + 4), undefined, 'le');

    log.info(
      `uploaded (${lineCount.toNumber()}) out of (${
        configData.data.maxNumberOfLines
      })`,
    );
    if (configData.data.maxNumberOfLines > lineCount.toNumber()) {
      throw new Error(
        `predefined number of NFTs (${
          configData.data.maxNumberOfLines
        }) is smaller than the uploaded one (${lineCount.toNumber()})`,
      );
    } else {
      log.info('ready to deploy!');
    }

    saveCache(cacheName, env, cacheContent);
  });

programCommand('create_candy_machine')
  .option('-p, --price <string>', 'SOL price', '1')
  .action(async (directory, cmd) => {
    const { keypair, env, price, cacheName } = cmd.opts();

    const lamports = parsePrice(price);
    const cacheContent = loadCache(cacheName, env);

    const walletKeyPair = loadWalletKey(keypair);
    const anchorProgram = await loadAnchorProgram(walletKeyPair, env);
    const config = new PublicKey(cacheContent.program.config);
    const [candyMachine, bump] = await getCandyMachineAddress(
      config,
      cacheContent.program.uuid,
    );
    await anchorProgram.rpc.initializeCandyMachine(
      bump,
      {
        uuid: cacheContent.program.uuid,
        price: new anchor.BN(lamports),
        itemsAvailable: new anchor.BN(Object.keys(cacheContent.items).length),
        goLiveDate: null,
      },
      {
        accounts: {
          candyMachine,
          wallet: walletKeyPair.publicKey,
          config: config,
          authority: walletKeyPair.publicKey,
          payer: walletKeyPair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [],
      },
    );
    updateCandyMachineList(candyMachine.toBase58(), env)
    saveCache(cacheName, env, cacheContent);
    log.info(`create_candy_machine finished. candy machine pubkey: ${candyMachine.toBase58()}`);
  });

programCommand('set_start_date')
  .option('-d, --date <string>', 'timestamp - eg "04 Dec 1995 00:12:00 GMT"')
  .action(async (directory, cmd) => {
    const { keypair, env, date, cacheName } = cmd.opts();
    const cacheContent = loadCache(cacheName, env);

    const secondsSinceEpoch = (date ? Date.parse(date) : Date.now()) / 1000;

    const walletKeyPair = loadWalletKey(keypair);
    const anchorProgram = await loadAnchorProgram(walletKeyPair, env);

    const [candyMachine] = await getCandyMachineAddress(
      new PublicKey(cacheContent.program.config),
      cacheContent.program.uuid,
    );
    const tx = await anchorProgram.rpc.updateCandyMachine(
      null,
      new anchor.BN(secondsSinceEpoch),
      {
        accounts: {
          candyMachine,
          authority: walletKeyPair.publicKey,
        },
      },
    );

    log.info('set_start_date Done', secondsSinceEpoch, tx);
  });

programCommand('mint_one_token')
  .action(async (directory, cmd) => {
    const {keypair, env, cacheName} = cmd.opts();

    const cacheContent = loadCache(cacheName, env);
    const configAddress = new PublicKey(cacheContent.program.config);
    const tx = await mint(keypair, env, configAddress);

    log.info('Done', tx);
  });

programCommand('sign')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .option('-m, --metadata <string>', 'base58 metadata account id')
  .action(async (directory, cmd) => {
    const {keypair, env, metadata} = cmd.opts();

    await signMetadata(
      metadata,
      keypair,
      env
    );
  });

programCommand('sign_all')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {keypair, env} = cmd.opts();

    await signAllUnapprovedMetadata(
      keypair,
      env
    );
  });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option(
      '-k, --keypair <path>',
      `Solana wallet location`,
      '--keypair not provided',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel)
    .option('-c, --cache-name <string>', 'Cache file name', 'temp');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null){
    return
  }
  log.info("setting the log value to: " + value);
  log.setLevel(value);
}

program.command('find-wallets').action(() => {
});

program
  .command('sign_candy_machine_metadata')
  .option(
    '-e, --env <string>',
    'Solana cluster env name',
    'devnet', //mainnet-beta, testnet, devnet
  )
  .option(
    '-k, --keypair <path>',
    `Solana wallet location`,
    '',
  )
  .option('-cndy, --candy-address <string>', 'Candy machine address', '')
  .option('-b, --batch-size <string>', 'Batch size', '10')
  .action(async (directory, cmd) => {
    let { keypair, env, candyAddress, batchSize } = cmd.opts();
    if (!keypair || keypair == '') {
      console.log("Keypair required!"); 
      return;
    }
    if (!candyAddress || candyAddress == '') {
      console.log("Candy machine address required! Using from saved list.")
      let address = getCandyMachineList(env);
      if (!address) {
        console.log("Could not find candy machine address list!")
        return;
      }
      candyAddress = address.candyList[0]
    } 
    let batchSizeParsed = parseInt(batchSize)
    if (!parseInt(batchSize)){
      console.log("Batch size needs to be an integer!")
      return;
    }
    const walletKeyPair = loadWalletKey(keypair);
    const anchorProgram = await loadAnchorProgram(walletKeyPair, env);
    console.log("Creator pubkey: ", walletKeyPair.publicKey.toBase58())
    console.log("Environment: ", env)
    console.log("Candy machine address: ", candyAddress)
    console.log("Batch Size: ", batchSizeParsed)
    await signAllMetadataFromCandyMachine(anchorProgram.provider.connection, walletKeyPair, candyAddress, batchSizeParsed)
  });

program.parse(process.argv);

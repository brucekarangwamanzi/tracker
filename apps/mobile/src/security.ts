import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
const PREFIX='bruces-life.';
export const secrets={
 async get(key:string){return Platform.OS==='web'?globalThis.localStorage?.getItem(PREFIX+key)??null:SecureStore.getItemAsync(PREFIX+key);},
 async set(key:string,value:string){if(Platform.OS==='web')globalThis.localStorage.setItem(PREFIX+key,value);else await SecureStore.setItemAsync(PREFIX+key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});},
 async remove(key:string){if(Platform.OS==='web')globalThis.localStorage.removeItem(PREFIX+key);else await SecureStore.deleteItemAsync(PREFIX+key);}
};
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function hash(pin:string,salt:string){return hex(await pbkdf2Async(sha256,pin,salt,{c:210000,dkLen:32}));}
export async function setPin(pin:string){if(!/^\d{6}$/.test(pin))throw new Error('Use exactly six digits.');const salt=hex(await Crypto.getRandomBytesAsync(24));await secrets.set('pin',JSON.stringify({salt,hash:await hash(pin,salt)}));await secrets.remove('pin-attempts');}
export async function verifyPin(pin:string){
 const attempt=JSON.parse(await secrets.get('pin-attempts')??'{"count":0,"until":0}') as {count:number;until:number};
 if(attempt.until>Date.now())throw new Error(`Try again in ${Math.ceil((attempt.until-Date.now())/1000)} seconds.`);
 const saved=await secrets.get('pin');if(!saved)throw new Error('Set up a PIN first.');
 const parsed=JSON.parse(saved) as {salt:string;hash:string};const candidate=await hash(pin,parsed.salt);let diff=0;
 for(let i=0;i<parsed.hash.length;i++)diff|=parsed.hash.charCodeAt(i)^(candidate.charCodeAt(i)??0);
 if(diff){const count=attempt.count+1;await secrets.set('pin-attempts',JSON.stringify({count,until:count>=5?Date.now()+Math.min(600000,30000*2**(count-5)):0}));throw new Error('That PIN didn’t match. Try again.');}
 await secrets.remove('pin-attempts');return true;
}
export async function biometricUnlock(){
 if(Platform.OS==='web')throw new Error('Biometric unlock is available in the installed mobile app.');
 if(!await LocalAuthentication.hasHardwareAsync()||!await LocalAuthentication.isEnrolledAsync())throw new Error('Set up biometrics in your device settings first.');
 const result=await LocalAuthentication.authenticateAsync({promptMessage:"Unlock Bruce’s Life",cancelLabel:'Use PIN',disableDeviceFallback:false});
 if(!result.success)throw new Error('Unlock cancelled. Enter your PIN to continue.');
 return true;
}

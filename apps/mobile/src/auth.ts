import {createClient} from '@supabase/supabase-js';
import {secrets} from './security';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const apiUrl=process.env.EXPO_PUBLIC_API_URL??'';
export const auth=url&&key?createClient(url,key,{auth:{storage:{getItem:k=>secrets.get('auth-'+k),setItem:(k,v)=>secrets.set('auth-'+k,v),removeItem:k=>secrets.remove('auth-'+k)},persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;

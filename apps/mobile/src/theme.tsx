import React,{createContext,useContext} from 'react';
export const dark={bg:'#0C1424',surface:'#172238',raised:'#1E2C45',text:'#F3F6FA',muted:'#AAB9CD',line:'#2A3A50',green:'#77E3B2',greenBg:'#193B35',red:'#FF8F91',redBg:'#3B2735',amber:'#F2C66D',amberBg:'#3A342B',blue:'#8EB8EC',primaryText:'#0C1424'};
export const light={bg:'#F6F8FB',surface:'#FFFFFF',raised:'#EAF0F7',text:'#142239',muted:'#526276',line:'#DCE3EC',green:'#187653',greenBg:'#E3F2EA',red:'#B74748',redBg:'#FBE8E8',amber:'#956009',amberBg:'#FFF2D5',blue:'#245F9C',primaryText:'#FFFFFF'};
export type Palette=typeof dark;
const Theme=createContext<Palette>(dark);
export function ThemeProvider({mode,children}:{mode:'light'|'dark';children:React.ReactNode}){return <Theme.Provider value={mode==='dark'?dark:light}>{children}</Theme.Provider>;}
export const useTheme=()=>useContext(Theme);

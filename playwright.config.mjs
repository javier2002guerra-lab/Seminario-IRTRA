import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'https://localhost:3443',ignoreHTTPSErrors:true},reporter:'list'});

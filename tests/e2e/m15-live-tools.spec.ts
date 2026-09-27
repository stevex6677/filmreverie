import { openViewingTools, closeViewingTools, openFrame } from "./helpers/viewing";
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { screenPoint } from './helpers/shelf';
import { getRegionMeanDifference } from './helpers/pixelAnalysis';

test('M15 iPad tools preserve scene brightness and show lighting, mode and framing changes while open',async({page},info)=>{
  await page.setViewportSize({width:1180,height:820});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/guest?fixture=36&mode=room&deterministic=true');
  const ready=async()=>{await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');};
  // Compare the actually visible scene, excluding the right-hand tools panel.
  const shot=async()=>PNG.sync.read(await page.screenshot({clip:{x:40,y:90,width:680,height:630}}));
  const difference=(a:PNG,b:PNG)=>getRegionMeanDifference(a,b,340,315,200);
  const tools=page.getByRole('dialog',{name:'Viewing tools'});
  await ready();const roomBefore=await shot();
  await page.getByRole('button',{name:'Settings',exact:true}).tap();await expect(tools).toBeVisible();
  expect(difference(roomBefore,await shot())).toBeLessThan(1);
  await page.getByLabel('Room brightness',{exact:true}).fill('0');await page.waitForTimeout(500);const dark=await shot();
  await page.getByLabel('Room brightness',{exact:true}).fill('1');await page.waitForTimeout(500);const bright=await shot();
  expect(difference(dark,bright)).toBeGreaterThan(3);await expect(tools).toBeVisible();
  await page.screenshot({path:info.outputPath('ipad-live-room-lights.png')});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Approach table',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Face table',exact:true})).toHaveCount(0);
  await expect(page.locator('.mobile-footer')).toHaveCount(0);
  const point = await screenPoint(page, [0, TABLE_SURFACE_Y + .002, 0]);
  await page.touchscreen.tap(point.x, point.y);await ready();
  await page.getByRole('button',{name:'Choose frame',exact:true}).tap();await page.getByRole('button',{name:'Open frame 7',exact:true}).tap();await ready();
  const frameBefore=await shot();await page.getByRole('button',{name:'Settings',exact:true}).tap();
  expect(difference(frameBefore,await shot())).toBeLessThan(1);
  await expect(tools.getByRole('button',{name:/Zoom/})).toHaveCount(0);
  await page.getByRole('button',{name:'Switch to Positive',exact:true}).tap();await page.waitForTimeout(500);
  expect(difference(frameBefore,await shot())).toBeGreaterThan(15);
  await page.getByLabel('Light Table Brightness',{exact:true}).fill('0.3');await page.waitForTimeout(500);const dimTable=await shot();
  await page.getByLabel('Light Table Brightness',{exact:true}).fill('1');await page.waitForTimeout(500);
  expect(difference(dimTable,await shot())).toBeGreaterThan(3);
  const frame=await shot();
  // M16 replaces the old three-level selector with explicit Overview/Focus.
  await expect(tools.getByRole('button',{name:/^(Roll|Strip|Frame)$/})).toHaveCount(0);
  await closeViewingTools(page);await page.getByRole('button',{name:'← Overview',exact:true}).tap();await ready();
  await expect(page.locator('main')).toHaveAttribute('data-inspection-level','roll');expect(difference(frame,await shot())).toBeGreaterThan(5);
  await openFrame(page,7);await openViewingTools(page);await ready();
  await page.screenshot({path:info.outputPath('ipad-live-viewing-tools.png')});
  expect(errors).toEqual([]);
});

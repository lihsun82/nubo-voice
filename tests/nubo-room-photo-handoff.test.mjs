import test from "node:test";
import assert from "node:assert/strict";
import { roomTypesFrom, guestRoomTypeView } from "../lib/pms-live-availability.ts";
import { pmsPhotoFloor } from "../lib/pms-photo-floor.ts";
import { GuestBookingHandoff } from "../lib/nubo-booking-handoff.ts";

const cd = {code:"CD", name:"智享雙人房", availableCount:1};
const ct = {code:"CT", name:"智享雙床房", availableCount:1};
const call = () => new GuestBookingHandoff(() => true, () => {});
const args = {checkIn:"2026-12-03",checkOut:"2026-12-04",adults:2};
function check(session, rows, asOf=new Date().toISOString()) {
  return session.inventory(session.invalidate(),"stay",args,{
    ready:true, covered:true, source:"live", asOf, inventoryView:guestRoomTypeView, roomTypes:roomTypesFrom(rows)
  });
}

test("PMS room identifiers and verified single-floor inventory expose only an album floor", () => {
  for (const [key,value,expected] of [["roomNumber",601,"6F"],["roomNo","803","8F"],["floor","7樓","7F"],
    ["recommendedRoom",{roomNumber:"305"},"3F"],["availableRooms",[{roomNo:601},{roomNo:603}],"6F"]]) {
    const row=roomTypesFrom([{...cd,[key]:value}])[0];
    assert.deepEqual(row,{...cd,photoFloor:expected});
  }
  assert.equal(pmsPhotoFloor({},[8]),"8F");
  for (const row of [{}, {roomNumber:401}, {roomNumber:"A601"}, {roomNumber:601,floor:"8F"},
    {availableRooms:[601,701]}, {availableRooms:[601,{}]}, {code:"601"}]) assert.equal(pmsPhotoFloor(row),null);
  assert.equal(pmsPhotoFloor({roomNumber:601},[7,8]),null);
  assert.equal(pmsPhotoFloor({},[7,8]),null);
  assert.equal(roomTypesFrom([{...cd,availableCount:0,roomNumber:601}])[0].photoFloor,undefined);
});

test("voice and manual opening resolve the discussed room type, never the first of multiple floors", () => {
  const session=call();
  check(session,[{...cd,roomNumber:601},{...ct,roomNumber:803}]);
  assert.equal(session.roomPhotoFloor(),null);
  session.replyTranscript("目前推薦智 享雙"); session.replyTranscript("人房。");
  session.guestTurn();
  assert.equal(session.roomPhotoFloor(),"6F");
  assert.equal(session.roomPhotoFloor("CT"),"8F");
  assert.equal(session.roomPhotoFloor("601"),null);
  session.replyTranscript("智享雙床房和智享雙人房均有房。");
  assert.equal(session.roomPhotoFloor(),null);
  check(session,[{...cd,roomNumber:601}]);
  session.request({purpose:"open_page"},null);
  assert.equal(session.roomPhotoFloor(),"6F");
  check(session,[ct]); assert.equal(session.roomPhotoFloor(),null);
  check(session,[{...cd,roomNumber:601}],new Date(Date.now()-310000).toISOString());
  assert.equal(session.roomPhotoFloor(),null);
});

test("only a verified reservation can supply the floor, and the previous guest or late query cannot override it", () => {
  const session=call();
  const reservation={matched:true,reservation:{status:"confirmed",stayStatus:"not_checked_in",photoFloor:"6F"}};
  const stale=session.invalidate(), live=session.invalidate();
  session.rememberReservation(stale,reservation); assert.equal(session.roomPhotoFloor(),null);
  session.rememberReservation(live,reservation); assert.equal(session.roomPhotoFloor(),"6F");
  session.request({purpose:"existing"},null); assert.equal(session.roomPhotoFloor(),"6F");
  session.reset(); assert.equal(session.roomPhotoFloor(),null);
  session.rememberReservation(session.invalidate(),{...reservation,matched:false}); assert.equal(session.roomPhotoFloor(),null);
});

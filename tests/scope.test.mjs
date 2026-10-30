import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { run, transaction } from "../lib/db.js";
import { areasWithinScope, scopedSurvey } from "../lib/scope.js";

test("un verificador solo accede a encuestas de sus áreas", async () => {
  const token = crypto.randomUUID();
  let userId, areaA, areaB, surveyA, surveyB;
  try {
    await transaction(async () => {
      areaA = Number((await run("INSERT INTO areas(name) VALUES(?) RETURNING id", `A-${token}`)).lastInsertRowid);
      areaB = Number((await run("INSERT INTO areas(name) VALUES(?) RETURNING id", `B-${token}`)).lastInsertRowid);
      userId = Number((await run(
        "INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1) RETURNING id",
        "Verificador prueba",
        `${token}@example.invalid`,
        "hash-no-utilizado",
        "verificador",
      )).lastInsertRowid);
      await run("INSERT INTO user_areas(user_id,area_id) VALUES(?,?)", userId, areaA);
      surveyA = Number((await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status) VALUES(?,?,?,?,?,?) RETURNING id",
        "a.png", `${token}-a.png`, "image/png", 100, `${token}-a`, "Recibido",
      )).lastInsertRowid);
      surveyB = Number((await run(
        "INSERT INTO surveys(original_name,stored_name,mime_type,size,sha256,status) VALUES(?,?,?,?,?,?) RETURNING id",
        "b.png", `${token}-b.png`, "image/png", 100, `${token}-b`, "Recibido",
      )).lastInsertRowid);
      await run("INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?)", surveyA, areaA);
      await run("INSERT INTO survey_areas(survey_id,area_id) VALUES(?,?)", surveyB, areaB);
    });
    const verifier = { id: userId, role: "verificador" };
    assert.equal(Number((await scopedSurvey(verifier, surveyA)).id), surveyA);
    assert.equal(await scopedSurvey(verifier, surveyB), undefined);
    assert.equal(Number((await scopedSurvey({ id: 1, role: "admin" }, surveyB)).id), surveyB);
    assert.equal(await areasWithinScope(verifier, [areaA]), true);
    assert.equal(await areasWithinScope(verifier, [areaB]), false);
  } finally {
    if (surveyA || surveyB)
      await run("DELETE FROM survey_areas WHERE survey_id=ANY(?::bigint[])", [surveyA, surveyB].filter(Boolean));
    if (surveyA || surveyB)
      await run("DELETE FROM surveys WHERE id=ANY(?::bigint[])", [surveyA, surveyB].filter(Boolean));
    if (userId) await run("DELETE FROM user_areas WHERE user_id=?", userId);
    if (userId) await run("DELETE FROM users WHERE id=?", userId);
    if (areaA || areaB)
      await run("DELETE FROM areas WHERE id=ANY(?::bigint[])", [areaA, areaB].filter(Boolean));
  }
});

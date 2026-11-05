import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { detectLang, i18n, translate } from "./index";
import { ru } from "./ru";
import { uz } from "./uz";

describe("i18n", () => {
  afterEach(() => i18n.set("en"));

  it("detects stored choice, then browser language, then Uzbek", () => {
    expect(detectLang("ru", ["en-US"])).toBe("ru");
    expect(detectLang(null, ["de-DE", "ru-RU"])).toBe("ru");
    expect(detectLang("xx", ["fr"])).toBe("uz");
  });

  it("fills placeholders and falls back to English", () => {
    expect(translate("uz", "nav.notificationsUnread", { n: 3 })).toBe("Bildirishnomalar, 3 ta o‘qilmagan");
    expect(translate("en", "footer.rights", { year: 2026 })).toBe("© 2026 iBlog");
  });

  it("has every key in every language", () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(uz).sort()).toEqual(keys);
    expect(Object.keys(ru).sort()).toEqual(keys);
  });

  it("persists the choice and sets <html lang>", () => {
    i18n.set("ru");
    expect(localStorage.getItem("iblog.lang")).toBe("ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(i18n.t("nav.signIn")).toBe("Войти");
  });
});

import { ref } from "vue";
import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";
import { uploadImage } from "../sync.ts";
import { shrinkImage } from "../utils/image.ts";
import { useI18n } from "vue-i18n";


/**
 * Foto für eine Lebenswoche aufnehmen und speichern.
 *
 * Anders als alle übrigen Eingaben braucht dieser Weg das Netz: Das Bild muss zum
 * Server, bevor der Eintrag einen Sinn ergibt. Das ist vertretbar, weil ein Foto
 * ohnehin nichts ist, was man um 3 Uhr nachts im Funkloch macht — aber der Fehlerfall
 * muss dann auch ehrlich benannt werden statt still zu scheitern.
 */
export function usePhotoUpload() {
  const { t } = useI18n();

  const data = useData();
  const toast = useToast();
  const busy = ref(false);

  /**
   * Verkleinern und hochladen, ohne einen Eintrag anzulegen.
   *
   * Für Bilder, die an einem ANDEREN Eintrag hängen — etwa die Verpackung der
   * Milchnahrung. Gibt die Medien-Id zurück oder null, wenn es nicht geklappt hat;
   * der Aufrufer entscheidet dann, ob er ohne Bild weitermacht.
   */
  async function uploadPhoto(file: File | Blob): Promise<string | null> {
    busy.value = true;
    try {
      return await uploadImage(await shrinkImage(file));
    } catch (error) {
      reportFailure(error);
      return null;
    } finally {
      busy.value = false;
    }
  }

  function reportFailure(error: unknown) {
    toast.show({
      headline: t("photo.failed.title"),
      description:
        error instanceof Error && error.message.includes("fehlgeschlagen")
          ? t("photo.failed.offline")
          : t("photo.failed.retry"),
      color: "danger",
      duration: 8000,
    });
  }

  async function savePhoto(file: File | Blob, lifeWeek: number, label?: string): Promise<boolean> {
    busy.value = true;
    try {
      const shrunk = await shrinkImage(file);
      const mediaId = await uploadImage(shrunk);

      await data.add(
        data.draft("photo", new Date(), {
          lifeWeek,
          mediaId,
          label: label?.trim() || null,
        }),
      );

      toast.show({ headline: t("photo.savedForWeek", { week: lifeWeek }), color: "success" });
      return true;
    } catch (error) {
      reportFailure(error);
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { savePhoto, uploadPhoto, busy };
}

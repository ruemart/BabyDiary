import { ref } from "vue";
import { useToast } from "sit-onyx";
import { useData } from "../stores/data.ts";
import { uploadImage } from "../sync.ts";
import { shrinkImage } from "../utils/image.ts";

/**
 * Foto für eine Lebenswoche aufnehmen und speichern.
 *
 * Anders als alle übrigen Eingaben braucht dieser Weg das Netz: Das Bild muss zum
 * Server, bevor der Eintrag einen Sinn ergibt. Das ist vertretbar, weil ein Foto
 * ohnehin nichts ist, was man um 3 Uhr nachts im Funkloch macht — aber der Fehlerfall
 * muss dann auch ehrlich benannt werden statt still zu scheitern.
 */
export function usePhotoUpload() {
  const data = useData();
  const toast = useToast();
  const busy = ref(false);

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

      toast.show({ headline: `Foto für Woche ${lifeWeek} gespeichert`, color: "success" });
      return true;
    } catch (error) {
      toast.show({
        headline: "Foto konnte nicht gespeichert werden",
        description:
          error instanceof Error && error.message.includes("fehlgeschlagen")
            ? "Keine Verbindung zum Server. Bitte im WLAN noch einmal versuchen."
            : "Bitte noch einmal versuchen.",
        color: "danger",
        duration: 8000,
      });
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { savePhoto, busy };
}

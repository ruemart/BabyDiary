import { ref } from "vue";
import { useToast } from "sit-onyx";
import { useConfirmToast } from "./useConfirmations.ts";
import { useData } from "../stores/data.ts";
import { uploadImage } from "../sync.ts";
import { shrinkImage } from "../utils/image.ts";
import { useI18n } from "vue-i18n";


/**
 * Take and store a photo for a week of life.
 *
 * Unlike every other input this path needs the network: the image has to reach the
 * server before the entry makes sense. That is acceptable, because a photo is not
 * something you take at three in the morning in a dead spot anyway — but the failure
 * case then has to be named honestly rather than failing silently.
 */
export function usePhotoUpload() {
  const { t } = useI18n();

  const data = useData();
  const toast = useToast();
  const confirm = useConfirmToast();
  const busy = ref(false);

  /**
   * Shrink and upload without creating an entry.
   *
   * For images that hang off ANOTHER entry — the formula packaging, for instance.
   * Returns the media id, or null when it did not work; the caller then decides whether
   * to carry on without a picture.
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

      confirm({ headline: t("photo.savedForWeek", { week: lifeWeek }), color: "success" });
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

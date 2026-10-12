import { Artifact } from "@/components/artifacts/create-artifact";
import { ImageEditor } from "@/components/editors/image/image-editor";
import { CopyIcon, RedoIcon, UndoIcon } from "@/components/icons/icons";
import { writeImageToClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

export const imageArtifact = new Artifact({
  kind: "image",
  description: "Useful for image generation",
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === "data-imageDelta") {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.data,
        status: "streaming",
      }));
    }
  },
  content: ImageEditor,
  actions: [
    {
      icon: <UndoIcon size={18} />,
      description: "View Previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: "View Next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy image to clipboard",
      onClick: async ({ content }) => {
        try {
          await writeImageToClipboard(`data:image/png;base64,${content}`);
          toast.success("Copied image to clipboard!");
        } catch {
          toast.error("Could not copy image to clipboard.");
        }
      },
    },
  ],
  toolbar: [],
});

import { useEffect, useRef, useState } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import {
  Button,
  cbModal,
  EntryReferenceDetails,
} from "@contentstack/venus-components";
import "@contentstack/venus-components/build/main.css";
import { client } from "@contentstack/management";
import SelectModal from "./components/SelectModal";
import type { ReferenceValue } from "./components/SelectModal";
import "./styles.css";

const ROW_HEIGHT = 50;
const BASE_HEIGHT = 55;

const CustomReferenceField: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [referenceTo, setReferenceTo] = useState<string[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<ReferenceValue[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stackRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customFieldRef = useRef<any>(null);

  useEffect(() => {
    ContentstackAppSDK.init().then(async (sdk) => {
      const iframeWrapperRef = ref.current;
      window.iframeRef = iframeWrapperRef;
      window.postRobot = sdk.postRobot;

      customFieldRef.current = sdk.location.CustomField;
      customFieldRef.current?.frame.enableAutoResizing();
      const refTo = sdk.location.CustomField?.field.schema.reference_to as
        | string[]
        | undefined;
      if (refTo) {
        setReferenceTo(refTo);
      }

      const managementClient = client({
        adapter: sdk.createAdapter(),
        host: sdk.endpoints.CMA,
      });
      const stack = managementClient.stack({
        api_key: sdk.ids.apiKey,
      });
      stackRef.current = stack;

      const existingData = sdk.location.CustomField?.field.getData() as
        | { uid: string; _content_type_uid: string }[]
        | undefined;

      if (existingData?.length) {
        sdk.location.CustomField?.frame.updateHeight(
          BASE_HEIGHT + existingData.length * ROW_HEIGHT
        );

        // Group saved refs by content type to minimize API calls
        const byContentType: Record<string, string[]> = {};
        for (const item of existingData) {
          if (!byContentType[item._content_type_uid]) {
            byContentType[item._content_type_uid] = [];
          }
          byContentType[item._content_type_uid].push(item.uid);
        }

        // Fetch titles for each content type in parallel
        const titleMap: Record<string, string> = {};
        await Promise.all(
          Object.entries(byContentType).map(async ([ctUid, uids]) => {
            try {
              const response = await stack
                .contentType(ctUid)
                .entry()
                .query({ query: { uid: { $in: uids } } })
                .find();
              for (const entry of response.items) {
                titleMap[entry.uid] = entry.title;
              }
            } catch (err) {
              console.error(`Failed to fetch titles for ${ctUid}:`, err);
            }
          })
        );

        setSelectedRefs(
          existingData.map((item) => ({
            ...item,
            title: titleMap[item.uid] ?? item.uid,
          }))
        );
      } else {
        sdk.location.CustomField?.frame.updateHeight(BASE_HEIGHT);
      }
    });
  }, []);

  const updateHeight = (count: number) => {
    customFieldRef.current?.frame.updateHeight(
      BASE_HEIGHT + count * ROW_HEIGHT
    );
  };

  const handleSave = (selected: ReferenceValue[]) => {
    setSelectedRefs(selected);
    updateHeight(selected.length);
    if (customFieldRef.current) {
      customFieldRef.current.field.setData(
        selected.map(({ uid, _content_type_uid }) => ({
          uid,
          _content_type_uid,
        }))
      );
    }
  };

  const handleDelete = (uid: string) => {
    const updated = selectedRefs.filter((r) => r.uid !== uid);
    setSelectedRefs(updated);
    updateHeight(updated.length);
    if (customFieldRef.current) {
      customFieldRef.current.field.setData(
        updated.map(({ uid, _content_type_uid }) => ({
          uid,
          _content_type_uid,
        }))
      );
    }
  };

  const handleClick = () => {
    cbModal({
      component: (props: Record<string, unknown>) => (
        <SelectModal
          {...props}
          referenceTo={referenceTo}
          stack={stackRef.current}
          onSave={handleSave}
        />
      ),
      modalProps: {
        size: "max",
        customClass: "select-reference-modal",
      },
    });
  };

  return (
    <div ref={ref} className="extension-wrapper">
      <div className="btn-wrapper">
        <Button buttonType="tertiary-outline" onClick={handleClick}>
          Select Reference
        </Button>
      </div>
      {selectedRefs.length > 0 && (
        <div className="reference-list">
          {selectedRefs.map((entry) => (
            <EntryReferenceDetails
              key={entry.uid}
              title={entry.title}
              contentType={entry._content_type_uid}
              onDelete={() => handleDelete(entry.uid)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomReferenceField;

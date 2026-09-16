import { useEffect, useState, useCallback } from "react";
import {
  ModalBody,
  ModalHeader,
  ModalFooter,
  Button,
  Select,
  Table,
} from "@contentstack/venus-components";

export interface ReferenceValue {
  uid: string;
  _content_type_uid: string;
  title: string;
}

interface EntryItem {
  title: string;
  uid: string;
  created_at: string;
}

interface SelectModalProps {
  closeModal?: () => void;
  referenceTo: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stack: any;
  onSave: (selected: ReferenceValue[]) => void;
}

const columns = [
  { Header: "Title", accessor: "title", default: true, disableSortBy: true },
  { Header: "UID", accessor: "uid", disableSortBy: true },
  {
    Header: "Created At",
    accessor: "created_at",
    disableSortBy: true,
    Cell: ({ value }: { value: string }) =>
      new Date(value).toLocaleDateString(),
  },
];

const SelectModal: React.FC<SelectModalProps> = ({
  closeModal,
  referenceTo,
  stack,
  onSave,
}) => {
  const options = referenceTo.map((ct) => ({ label: ct, value: ct }));
  const [selectedContentType, setSelectedContentType] = useState(
    options[0] ?? null
  );
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReferenceValue[]>([]);

  useEffect(() => {
    if (!selectedContentType || !stack) return;

    let cancelled = false;
    setLoading(true);

    stack
      .contentType(selectedContentType.value)
      .entry()
      .query()
      .find()
      .then((response: { items: EntryItem[] }) => {
        if (!cancelled) {
          setEntries(response.items ?? []);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch entries:", err);
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedContentType, stack]);

  const handleSelectedRows = useCallback(
    (selectedRows: EntryItem[]) => {
      if (!selectedContentType) return;

      // Keep selections from other content types
      const otherSelections = selected.filter(
        (s) => s._content_type_uid !== selectedContentType.value
      );

      const currentSelections = selectedRows.map((entry) => ({
        uid: entry.uid,
        _content_type_uid: selectedContentType.value,
        title: entry.title,
      }));

      setSelected([...otherSelections, ...currentSelections]);
    },
    [selectedContentType, selected]
  );

  const handleAdd = () => {
    onSave(selected);
    closeModal?.();
  };

  // Build initialSelectedRowIds for the current content type's entries
  const initialSelectedRowIds: Record<string, boolean> = {};
  if (selectedContentType) {
    entries.forEach((entry, index) => {
      if (
        selected.some(
          (s) =>
            s.uid === entry.uid &&
            s._content_type_uid === selectedContentType.value
        )
      ) {
        initialSelectedRowIds[index] = true;
      }
    });
  }

  return (
    <>
      <ModalHeader title="Select Reference" closeModal={closeModal} />
      <ModalBody>
        <div className="select-modal-content">
          <div className="selector-row">
            <Select
              options={options}
              value={selectedContentType}
              onChange={(option: { label: string; value: string }) =>
                setSelectedContentType(option)
              }
              placeholder="Select content type"
              selectLabel="Content Type"
            />
          </div>
          {selected.length > 0 && (
            <p className="selected-count">
              {selected.length} entry{selected.length !== 1 ? "ies" : "y"}{" "}
              selected
            </p>
          )}
          <div className="table-wrapper">
            <Table
              columns={columns}
              data={entries}
              uniqueKey="uid"
              loading={loading}
              totalCounts={entries.length}
              isRowSelect={true}
              getSelectedRow={handleSelectedRows}
              initialSelectedRowIds={initialSelectedRowIds}
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button buttonType="light" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={handleAdd} disabled={selected.length === 0}>
          Add Selected ({selected.length})
        </Button>
      </ModalFooter>
    </>
  );
};

export default SelectModal;

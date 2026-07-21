export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          appointment: boolean
          channel: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          last_message_at: string
          order_captured: boolean
          organization_id: string
          resolved: boolean
          tag: string | null
          unread: boolean
        }
        Insert: {
          appointment?: boolean
          channel?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          last_message_at?: string
          order_captured?: boolean
          organization_id: string
          resolved?: boolean
          tag?: string | null
          unread?: boolean
        }
        Update: {
          appointment?: boolean
          channel?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          last_message_at?: string
          order_captured?: boolean
          organization_id?: string
          resolved?: boolean
          tag?: string | null
          unread?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["ai_role"]
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["ai_role"]
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["ai_role"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          ends_at: string
          id: string
          notes: string | null
          organization_id: string
          patient_name: string
          professional_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          organization_id: string
          patient_name: string
          professional_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_name?: string
          professional_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string
          entity_type: string
          id: number
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id: string
          entity_type: string
          id?: never
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string
          entity_type?: string
          id?: never
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_defs: {
        Row: {
          active: boolean
          field_key: string
          field_type: string
          id: string
          label: string
          module_key: string
          options: Json
          organization_id: string
          required: boolean
          sort: number
        }
        Insert: {
          active?: boolean
          field_key: string
          field_type: string
          id?: string
          label: string
          module_key: string
          options?: Json
          organization_id: string
          required?: boolean
          sort?: number
        }
        Update: {
          active?: boolean
          field_key?: string
          field_type?: string
          id?: string
          label?: string
          module_key?: string
          options?: Json
          organization_id?: string
          required?: boolean
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_defs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          balance: number
          contact_name: string | null
          cp: string | null
          created_at: string
          credit_days: number
          credit_limit: number
          discount_pct: number
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          price_list_id: string | null
          profile_id: string | null
          regimen_code: string | null
          regimen_fiscal: string | null
          rfc: string | null
          updated_at: string
          uso_cfdi: string | null
          uso_cfdi_code: string | null
        }
        Insert: {
          active?: boolean
          balance?: number
          contact_name?: string | null
          cp?: string | null
          created_at?: string
          credit_days?: number
          credit_limit?: number
          discount_pct?: number
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          price_list_id?: string | null
          profile_id?: string | null
          regimen_code?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          updated_at?: string
          uso_cfdi?: string | null
          uso_cfdi_code?: string | null
        }
        Update: {
          active?: boolean
          balance?: number
          contact_name?: string | null
          cp?: string | null
          created_at?: string
          credit_days?: number
          credit_limit?: number
          discount_pct?: number
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          price_list_id?: string | null
          profile_id?: string | null
          regimen_code?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          updated_at?: string
          uso_cfdi?: string | null
          uso_cfdi_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_regimen_code_fkey"
            columns: ["regimen_code"]
            isOneToOne: false
            referencedRelation: "sat_regimen_fiscal"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "customers_uso_cfdi_code_fkey"
            columns: ["uso_cfdi_code"]
            isOneToOne: false
            referencedRelation: "sat_uso_cfdi"
            referencedColumns: ["code"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          dst_id: string
          dst_type: string
          id: string
          organization_id: string
          src_id: string
          src_type: string
        }
        Insert: {
          created_at?: string
          dst_id: string
          dst_type: string
          id?: string
          organization_id: string
          src_id: string
          src_type: string
        }
        Update: {
          created_at?: string
          dst_id?: string
          dst_type?: string
          id?: string
          organization_id?: string
          src_id?: string
          src_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          organization_id: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          organization_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          organization_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          avg_cost: number
          id: string
          max_stock: number
          min_stock: number
          organization_id: string
          product_variant_id: string
          stock: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          avg_cost?: number
          id?: string
          max_stock?: number
          min_stock?: number
          organization_id: string
          product_variant_id: string
          stock?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          avg_cost?: number
          id?: string
          max_stock?: number
          min_stock?: number
          organization_id?: string
          product_variant_id?: string
          stock?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_qty: number | null
          id: string
          organization_id: string
          product_variant_id: string
          system_qty: number
        }
        Insert: {
          count_id: string
          counted_qty?: number | null
          id?: string
          organization_id: string
          product_variant_id: string
          system_qty?: number
        }
        Update: {
          count_id?: string
          counted_qty?: number | null
          id?: string
          organization_id?: string
          product_variant_id?: string
          system_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          folio: string
          id: string
          notas: string | null
          organization_id: string
          status: Database["public"]["Enums"]["inventory_count_status"]
          warehouse_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          folio: string
          id?: string
          notas?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["inventory_count_status"]
          warehouse_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          folio?: string
          id?: string
          notas?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["inventory_count_status"]
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          avg_cost_after: number | null
          balance_after: number | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          product_variant_id: string
          qty: number
          reason: string | null
          ref_id: string | null
          ref_type: string | null
          type: Database["public"]["Enums"]["movement_type"]
          unit_cost: number | null
          warehouse_id: string
        }
        Insert: {
          avg_cost_after?: number | null
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          product_variant_id: string
          qty: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          type: Database["public"]["Enums"]["movement_type"]
          unit_cost?: number | null
          warehouse_id: string
        }
        Update: {
          avg_cost_after?: number | null
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          product_variant_id?: string
          qty?: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
          unit_cost?: number | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          id: string
          organization_id: string
          product_variant_id: string
          qty: number
          transfer_id: string
          unit_cost: number | null
        }
        Insert: {
          id?: string
          organization_id: string
          product_variant_id: string
          qty: number
          transfer_id: string
          unit_cost?: number | null
        }
        Update: {
          id?: string
          organization_id?: string
          product_variant_id?: string
          qty?: number
          transfer_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          folio: string
          from_warehouse_id: string
          id: string
          notas: string | null
          organization_id: string
          received_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          folio: string
          from_warehouse_id: string
          id?: string
          notas?: string | null
          organization_id: string
          received_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          folio?: string
          from_warehouse_id?: string
          id?: string
          notas?: string | null
          organization_id?: string
          received_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          discount_pct: number
          id: string
          invoice_id: string
          iva_rate: number
          line_total: number
          name: string
          organization_id: string
          product_variant_id: string | null
          qty: number
          sku: string | null
          unit_price: number
        }
        Insert: {
          discount_pct?: number
          id?: string
          invoice_id: string
          iva_rate?: number
          line_total: number
          name: string
          organization_id: string
          product_variant_id?: string | null
          qty: number
          sku?: string | null
          unit_price: number
        }
        Update: {
          discount_pct?: number
          id?: string
          invoice_id?: string
          iva_rate?: number
          line_total?: number
          name?: string
          organization_id?: string
          product_variant_id?: string | null
          qty?: number
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          created_at: string
          created_by: string | null
          fecha: string
          forma_pago: string
          id: string
          invoice_id: string
          is_rep: boolean
          monto: number
          organization_id: string
          uuid_rep: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fecha?: string
          forma_pago: string
          id?: string
          invoice_id: string
          is_rep?: boolean
          monto: number
          organization_id: string
          uuid_rep?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fecha?: string
          forma_pago?: string
          id?: string
          invoice_id?: string
          is_rep?: boolean
          monto?: number
          organization_id?: string
          uuid_rep?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cancelada_at: string | null
          created_at: string
          customer_id: string | null
          folio: string
          forma_pago: string | null
          id: string
          metodo_pago: string | null
          order_id: string | null
          organization_id: string
          pdf_path: string | null
          regimen: string | null
          saldo: number | null
          serie: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          timbrada_at: string | null
          total: number
          updated_at: string
          uso_cfdi: string | null
          uuid: string | null
          xml_path: string | null
        }
        Insert: {
          cancelada_at?: string | null
          created_at?: string
          customer_id?: string | null
          folio: string
          forma_pago?: string | null
          id?: string
          metodo_pago?: string | null
          order_id?: string | null
          organization_id: string
          pdf_path?: string | null
          regimen?: string | null
          saldo?: number | null
          serie?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          timbrada_at?: string | null
          total?: number
          updated_at?: string
          uso_cfdi?: string | null
          uuid?: string | null
          xml_path?: string | null
        }
        Update: {
          cancelada_at?: string | null
          created_at?: string
          customer_id?: string | null
          folio?: string
          forma_pago?: string | null
          id?: string
          metodo_pago?: string | null
          order_id?: string | null
          organization_id?: string
          pdf_path?: string | null
          regimen?: string | null
          saldo?: number | null
          serie?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          timbrada_at?: string | null
          total?: number
          updated_at?: string
          uso_cfdi?: string | null
          uuid?: string | null
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          business: string | null
          contact: string | null
          created_at: string
          id: string
          industry: string | null
          ip: string | null
          message: string | null
          name: string
          size: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: string
          user_agent: string | null
        }
        Insert: {
          business?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          ip?: string | null
          message?: string | null
          name: string
          size?: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status?: string
          user_agent?: string | null
        }
        Update: {
          business?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          ip?: string | null
          message?: string | null
          name?: string
          size?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      modules: {
        Row: {
          core: boolean
          created_at: string
          icon: string | null
          id: string
          key: string
          name: string
          requires: Json
          route_prefix: string
          sort: number
        }
        Insert: {
          core?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          key: string
          name: string
          requires?: Json
          route_prefix: string
          sort?: number
        }
        Update: {
          core?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          key?: string
          name?: string
          requires?: Json
          route_prefix?: string
          sort?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          name: string
          order_id: string
          organization_id: string
          product_variant_id: string | null
          qty: number
          qty_delivered: number
          sku: string | null
          unit_price: number
        }
        Insert: {
          id?: string
          line_total?: number
          name: string
          order_id: string
          organization_id: string
          product_variant_id?: string | null
          qty?: number
          qty_delivered?: number
          sku?: string | null
          unit_price?: number
        }
        Update: {
          id?: string
          line_total?: number
          name?: string
          order_id?: string
          organization_id?: string
          product_variant_id?: string | null
          qty?: number
          qty_delivered?: number
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          folio: string
          id: string
          items_count: number
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["order_status"]
          stock_applied: boolean
          subtotal: number
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          folio: string
          id?: string
          items_count?: number
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["order_status"]
          stock_applied?: boolean
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          folio?: string
          id?: string
          items_count?: number
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          stock_applied?: boolean
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      org_counters: {
        Row: {
          entity: string
          organization_id: string
          value: number
        }
        Insert: {
          entity: string
          organization_id: string
          value?: number
        }
        Update: {
          entity?: string
          organization_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_series: {
        Row: {
          doc_type: string
          id: string
          is_default: boolean
          next_value: number
          organization_id: string
          prefix: string
          serie: string
        }
        Insert: {
          doc_type: string
          id?: string
          is_default?: boolean
          next_value?: number
          organization_id: string
          prefix: string
          serie?: string
        }
        Update: {
          doc_type?: string
          id?: string
          is_default?: boolean
          next_value?: number
          organization_id?: string
          prefix?: string
          serie?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_series_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_modules: {
        Row: {
          config: Json
          enabled: boolean
          module_id: string
          organization_id: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          module_id: string
          organization_id: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          module_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          allow_backorder: boolean
          brand_color: string | null
          created_at: string
          custom_domain: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          plan_id: string | null
          rfc: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
          vertical_id: string | null
        }
        Insert: {
          allow_backorder?: boolean
          brand_color?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          plan_id?: string | null
          rfc?: string | null
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          vertical_id?: string | null
        }
        Update: {
          allow_backorder?: boolean
          brand_color?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          rfc?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          vertical_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_vertical_id_fkey"
            columns: ["vertical_id"]
            isOneToOne: false
            referencedRelation: "verticals"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          id: string
          method: string | null
          order_id: string | null
          organization_id: string
          status: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          method?: string | null
          order_id?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          method?: string | null
          order_id?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          highlight: boolean
          id: string
          key: string
          max_orders_month: number | null
          max_products: number | null
          max_users: number | null
          name: string
          period: string
          price_annual_mxn: number | null
          price_mxn: number | null
          sort: number
        }
        Insert: {
          created_at?: string
          highlight?: boolean
          id?: string
          key: string
          max_orders_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name: string
          period?: string
          price_annual_mxn?: number | null
          price_mxn?: number | null
          sort?: number
        }
        Update: {
          created_at?: string
          highlight?: boolean
          id?: string
          key?: string
          max_orders_month?: number | null
          max_products?: number | null
          max_users?: number | null
          name?: string
          period?: string
          price_annual_mxn?: number | null
          price_mxn?: number | null
          sort?: number
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          id: string
          organization_id: string
          price_list_id: string
          price_mxn: number
          product_variant_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          price_list_id: string
          price_mxn: number
          product_variant_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          price_list_id?: string
          price_mxn?: number
          product_variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          base_price_mxn: number
          clave_unidad: string
          created_at: string
          id: string
          name: string
          organization_id: string
          product_id: string
          sku: string
        }
        Insert: {
          attributes?: Json
          base_price_mxn?: number
          clave_unidad?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          product_id: string
          sku: string
        }
        Update: {
          attributes?: Json
          base_price_mxn?: number
          clave_unidad?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          product_id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_clave_unidad_fkey"
            columns: ["clave_unidad"]
            isOneToOne: false
            referencedRelation: "sat_clave_unidad"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          clave_prod_serv: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          iva_rate: number
          name: string
          organization_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          clave_prod_serv?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          iva_rate?: number
          name: string
          organization_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          clave_prod_serv?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          iva_rate?: number
          name?: string
          organization_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          discount_pct: number
          id: string
          iva_rate: number
          line_total: number
          name: string
          organization_id: string
          product_variant_id: string | null
          qty: number
          quote_id: string
          sku: string | null
          unit_price: number
        }
        Insert: {
          discount_pct?: number
          id?: string
          iva_rate?: number
          line_total: number
          name: string
          organization_id: string
          product_variant_id?: string | null
          qty: number
          quote_id: string
          sku?: string | null
          unit_price: number
        }
        Update: {
          discount_pct?: number
          id?: string
          iva_rate?: number
          line_total?: number
          name?: string
          organization_id?: string
          product_variant_id?: string | null
          qty?: number
          quote_id?: string
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string | null
          custom: Json
          customer_id: string | null
          descuento_global_pct: number
          folio: string
          id: string
          notas: string | null
          organization_id: string
          parent_quote_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          valid_until: string | null
          version: number
          vigencia_dias: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_id?: string | null
          descuento_global_pct?: number
          folio: string
          id?: string
          notas?: string | null
          organization_id: string
          parent_quote_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          vigencia_dias?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_id?: string | null
          descuento_global_pct?: number
          folio?: string
          id?: string
          notas?: string | null
          organization_id?: string
          parent_quote_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
          vigencia_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          id: string
          module_key: string
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          action: string
          allowed: boolean
          id?: string
          module_key: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          action?: string
          allowed?: boolean
          id?: string
          module_key?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_clave_unidad: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      sat_forma_pago: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      sat_metodo_pago: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      sat_regimen_fiscal: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      sat_uso_cfdi: {
        Row: {
          code: string
          label: string
        }
        Insert: {
          code: string
          label: string
        }
        Update: {
          code?: string
          label?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      verticals: {
        Row: {
          created_at: string
          default_modules: Json
          description: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          default_modules?: Json
          description?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          default_modules?: Json
          description?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_auto_responses: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          keyword: string
          organization_id: string | null
          response: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          keyword: string
          organization_id?: string | null
          response: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          keyword?: string
          organization_id?: string | null
          response?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_auto_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_inventory: {
        Args: {
          p_qty: number
          p_reason?: string
          p_ref_id?: string
          p_ref_type?: string
          p_type?: Database["public"]["Enums"]["movement_type"]
          p_unit_cost?: number
          p_variant: string
          p_warehouse: string
        }
        Returns: {
          avg_cost: number
          id: string
          max_stock: number
          min_stock: number
          organization_id: string
          product_variant_id: string
          stock: number
          updated_at: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      aplicar_conteo: {
        Args: { p_count: string }
        Returns: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          folio: string
          id: string
          notas: string | null
          organization_id: string
          status: Database["public"]["Enums"]["inventory_count_status"]
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_counts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_default_modules: {
        Args: { p_org: string; p_vertical: string }
        Returns: undefined
      }
      cancelar_traspaso: {
        Args: { p_motivo: string; p_transfer: string }
        Returns: {
          created_at: string
          created_by: string | null
          folio: string
          from_warehouse_id: string
          id: string
          notas: string | null
          organization_id: string
          received_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_org_id: { Args: never; Returns: string }
      enviar_traspaso: {
        Args: { p_transfer: string }
        Returns: {
          created_at: string
          created_by: string | null
          folio: string
          from_warehouse_id: string
          id: string
          notas: string | null
          organization_id: string
          received_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_perm: {
        Args: { p_action: string; p_module: string }
        Returns: boolean
      }
      link_docs: {
        Args: {
          p_dst_id: string
          p_dst_type: string
          p_src_id: string
          p_src_type: string
        }
        Returns: undefined
      }
      next_folio: { Args: { p_entity: string; p_org: string }; Returns: number }
      next_serie_folio: {
        Args: { p_doc_type: string; p_org: string; p_serie?: string }
        Returns: string
      }
      org_has_module: { Args: { p_module: string }; Returns: boolean }
      recibir_traspaso: {
        Args: { p_transfer: string }
        Returns: {
          created_at: string
          created_by: string | null
          folio: string
          from_warehouse_id: string
          id: string
          notas: string | null
          organization_id: string
          received_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["inventory_transfer_status"]
          to_warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_delivery: {
        Args: { p_lines: Json; p_order_id: string }
        Returns: {
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          folio: string
          id: string
          items_count: number
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["order_status"]
          stock_applied: boolean
          subtotal: number
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_pago_factura: {
        Args: {
          p_forma: string
          p_invoice: string
          p_monto: number
          p_uuid_rep?: string
        }
        Returns: {
          cancelada_at: string | null
          created_at: string
          customer_id: string | null
          folio: string
          forma_pago: string | null
          id: string
          metodo_pago: string | null
          order_id: string | null
          organization_id: string
          pdf_path: string | null
          regimen: string | null
          saldo: number | null
          serie: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          timbrada_at: string | null
          total: number
          updated_at: string
          uso_cfdi: string | null
          uuid: string | null
          xml_path: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_order: {
        Args: {
          p_new: Database["public"]["Enums"]["order_status"]
          p_order_id: string
        }
        Returns: {
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          folio: string
          id: string
          items_count: number
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["order_status"]
          stock_applied: boolean
          subtotal: number
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ai_role: "user" | "agent"
      appointment_status: "agendada" | "confirmada" | "completada" | "cancelada"
      inventory_count_status:
        | "borrador"
        | "en_conteo"
        | "aplicado"
        | "cancelada"
      inventory_transfer_status:
        | "borrador"
        | "en_transito"
        | "recibido"
        | "cancelada"
      invoice_status:
        | "borrador"
        | "timbrada"
        | "cancelada"
        | "pagada"
        | "pago_parcial"
      lead_source: "contacto" | "agenda_demo"
      movement_type: "entrada" | "salida" | "ajuste"
      order_status:
        | "borrador"
        | "confirmado"
        | "pagado"
        | "surtido"
        | "facturado"
        | "enviado"
        | "cancelada"
        | "surtido_parcial"
      org_status: "activo" | "prueba" | "suspendido"
      payment_status: "pendiente" | "exitoso" | "fallido" | "reembolsado"
      quote_status:
        | "borrador"
        | "enviada"
        | "aceptada"
        | "rechazada"
        | "vencida"
      subscription_status: "activa" | "prueba" | "morosa" | "cancelada"
      user_role:
        | "super_admin"
        | "tenant_admin"
        | "tenant_user"
        | "customer"
        | "tenant_viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_role: ["user", "agent"],
      appointment_status: ["agendada", "confirmada", "completada", "cancelada"],
      inventory_count_status: [
        "borrador",
        "en_conteo",
        "aplicado",
        "cancelada",
      ],
      inventory_transfer_status: [
        "borrador",
        "en_transito",
        "recibido",
        "cancelada",
      ],
      invoice_status: [
        "borrador",
        "timbrada",
        "cancelada",
        "pagada",
        "pago_parcial",
      ],
      lead_source: ["contacto", "agenda_demo"],
      movement_type: ["entrada", "salida", "ajuste"],
      order_status: [
        "borrador",
        "confirmado",
        "pagado",
        "surtido",
        "facturado",
        "enviado",
        "cancelada",
        "surtido_parcial",
      ],
      org_status: ["activo", "prueba", "suspendido"],
      payment_status: ["pendiente", "exitoso", "fallido", "reembolsado"],
      quote_status: ["borrador", "enviada", "aceptada", "rechazada", "vencida"],
      subscription_status: ["activa", "prueba", "morosa", "cancelada"],
      user_role: [
        "super_admin",
        "tenant_admin",
        "tenant_user",
        "customer",
        "tenant_viewer",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

